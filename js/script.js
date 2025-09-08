import { db } from "./firebase.js";
import {
  collection, addDoc, serverTimestamp, onSnapshot, query,
  deleteDoc, doc, where, updateDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

(function () {
  let activeIntervals = [];
  let resizeTimer = null;
  let unsub = null;
  let unsubInvites = null;
  let currentUid = null;
  let teamUid = null;
  const sessionInvites = [];

  function normalizeEmail(v) {
    const s = String(v || "").trim().toLowerCase();
    const m = s.match(/^([^@]+)@([^@]+)$/);
    if (!m) return s;
    let [_, local, domain] = m;
    if (domain === "gmail.com" || domain === "googlemail.com") {
      local = local.replace(/\./g, "").replace(/\+.*/, "");
      domain = "gmail.com";
    }
    return `${local}@${domain}`;
  }

  function clearAllIntervals(){ for (const id of activeIntervals) clearInterval(id); activeIntervals = []; }
  function unsubscribe(){ if (typeof unsub === "function"){ try {unsub();} catch(_){} unsub = null; } }
  function unsubscribeInvites(){ if (typeof unsubInvites === "function"){ try {unsubInvites();} catch(_){} unsubInvites = null; } }

  function applyContainerScroll(){
    const containers = document.querySelectorAll('.cards-container');
    containers.forEach(container=>{
      const items=[...container.children];
      if(items.length<=2){ container.style.maxHeight=''; container.style.overflowY=''; return; }
      const gap=parseFloat(getComputedStyle(container).rowGap||'0');
      const h=items.slice(0,2).reduce((a,el)=>a+el.getBoundingClientRect().height,0);
      container.style.maxHeight=(h+gap)+'px';
      container.style.overflowY='auto';
    });
  }

  function ensureAppend(container, el){ if(el.parentElement!==container) container.appendChild(el); }

  function renderUsers(users){
    clearAllIntervals();
    const acShared=document.getElementById('active-shared');
    const acSolo=document.getElementById('active-solo');
    const exShared=document.getElementById('expired-shared');
    const exSolo=document.getElementById('expired-solo');
    acShared.innerHTML=''; acSolo.innerHTML=''; exShared.innerHTML=''; exSolo.innerHTML='';

    users.forEach(user=>{
      const card=document.createElement('div');
      card.className='card';
      card.innerHTML='<div class="card-top"><div class="nick"></div><div class="status-badge"></div></div><div class="time-left"></div><div class="actions-row"><button class="delete">Удалить</button></div>';
      const nick=card.querySelector('.nick');
      const badge=card.querySelector('.status-badge');
      const timeLeft=card.querySelector('.time-left');
      const del=card.querySelector('.delete');
      nick.textContent=user.nickname;
      badge.textContent='Активно';
      if(user.team){
        card.classList.add('team-owned');
        const tb=document.createElement('span');
        tb.className='team-badge'; tb.textContent='Team';
        card.querySelector('.card-top').appendChild(tb);
      }
      del.addEventListener('click', async()=>{
        const me=window.__authUser && window.__authUser.uid ? window.__authUser.uid : null;
        if(!me || me!==user.ownerUid){ alert('Удалять может только владелец записи.'); return; }
        try{ await deleteDoc(doc(db,'rentals',user.id)); }catch(_){ alert('Ошибка удаления'); }
      });

      async function updateTime(){
        const now=Date.now();
        const diff=user.expiresMs-now;
        if(diff<=0){
          ensureAppend(user.tier==='solo'?exSolo:exShared, card);
          if(card.dataset.state!=='expired'){
            card.dataset.state='expired';
            card.classList.remove('anim-enter-active');
            card.classList.add('anim-to-expired');
            setTimeout(()=>card.classList.remove('anim-to-expired'),650);
          }
          card.classList.add('expired');
          badge.textContent='Просрочено';
          timeLeft.textContent='Оставшееся время: 0с';
          if(!user.notified){
            try{ await updateDoc(doc(db,'rentals',user.id), {notified:true}); }catch(_){}
            const audio=document.getElementById('notificationSound');
            if(audio){ audio.currentTime=0; audio.play(); setTimeout(()=>{ try{audio.pause(); audio.currentTime=0;}catch(_){}} ,5000); }
            showNotification('Аренда '+user.nickname+' просрочена');
          }
          return;
        }
        const totalSeconds=Math.floor(diff/1000);
        const days=Math.floor(totalSeconds/(24*3600));
        const hours=Math.floor((totalSeconds%(24*3600))/3600);
        const minutes=Math.floor((totalSeconds%3600)/60);
        const seconds=totalSeconds%60;
        const target=user.tier==='solo'?acSolo:acShared;
        if(card.dataset.state!=='active'){
          ensureAppend(target, card);
          card.dataset.state='active';
          card.classList.remove('expired','anim-to-expired','anim-enter-expired');
          card.classList.add('anim-enter-active');
          setTimeout(()=>card.classList.remove('anim-enter-active'),600);
        } else ensureAppend(target, card);
        badge.textContent='Активно';
        timeLeft.textContent='Оставшееся время: '+(days>0?(days+'д '):'')+hours+'ч '+minutes+'м '+seconds+'с';
      }
      updateTime();
      const id=setInterval(updateTime,1000);
      activeIntervals.push(id);
    });

    applyContainerScroll();
  }

  function safeExpiryMs(value, unit){
    const now = new Date();
    const v = Number(value);
    if (!isFinite(v) || v <= 0) return null;
    const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
    if (unit === 'months'){
      const whole = Math.floor(v);
      const fracDays = Math.round((v - whole) * 30);
      const d = new Date(now);
      d.setHours(0,0,0,0);
      d.setMonth(d.getMonth() + clamp(whole, 0, 120));
      d.setDate(d.getDate() + clamp(fracDays, 0, 31));
      return Math.min(d.getTime(), now.getTime() + 10 * 365 * 24 * 3600 * 1000);
    }
    const mult = unit==='minutes' ? 60*1000 :
                 unit==='hours'   ? 60*60*1000 :
                 unit==='days'    ? 24*60*60*1000 : 60*60*1000;
    const ms = now.getTime() + v * mult;
    const max = now.getTime() + 10 * 365 * 24 * 3600 * 1000;
    return Math.min(ms, max);
  }

  async function addUser(tier){
    if(!window.__authUser){ alert('Пожалуйста, войдите через Google, чтобы добавлять аренды.'); return; }
    const nicknameInput=document.getElementById('nickname');
    const valueInput=document.getElementById('durationValue');
    const unitSelect=document.getElementById('durationUnit');

    const nickname=nicknameInput.value.trim();
    const value=parseFloat(valueInput.value.trim());
    const unit=unitSelect.value;

    if(!nickname || !isFinite(value) || value<=0){ alert('Пожалуйста, введите корректные данные.'); return; }

    const expiresMs = safeExpiryMs(value, unit);
    if(!expiresMs){ alert('Некорректное время аренды.'); return; }

    try{
      await addDoc(collection(db,'rentals'),{
        nickname,
        expiresMs,
        tier,
        ownerUid: window.__authUser.uid,
        notified:false,
        createdAt: serverTimestamp()
      });
    }catch(e){
      alert('Ошибка добавления аренды. Попробуйте уменьшить срок и повторить.');
      return;
    }

    nicknameInput.value=''; valueInput.value=''; unitSelect.value='hours';
    syncCustomSelect('durationUnit','hours','Часы');
    showNotification('Аренда успешно добавлена');
  }

  function initCustomSelect(id){
    const wrap=document.querySelector('.select-wrap[data-select="'+id+'"]');
    const btn=wrap.querySelector('.select-toggle');
    const menu=wrap.querySelector('.select-menu');
    const native=document.getElementById(id);
    const panel=wrap.closest('.panel');

    function close(){ btn.setAttribute('aria-expanded','false'); menu.classList.remove('open'); if(panel) panel.classList.remove('bring-to-front'); }
    function open(){ btn.setAttribute('aria-expanded','true'); menu.classList.add('open'); if(panel) panel.classList.add('bring-to-front'); menu.focus(); }

    btn.addEventListener('click',()=>{ menu.classList.contains('open')?close():open(); });
    menu.addEventListener('click',e=>{
      const li=e.target.closest('[data-value]'); if(!li) return;
      const value=li.getAttribute('data-value'); const label=li.textContent.trim();
      native.value=value; btn.textContent=label;
      menu.querySelectorAll('[aria-selected="true"]').forEach(el=>el.setAttribute('aria-selected','false'));
      li.setAttribute('aria-selected','true'); close();
    });
    document.addEventListener('click',e=>{ if(!wrap.contains(e.target)) close(); });
    menu.addEventListener('keydown',e=>{
      const items=[...menu.querySelectorAll('[data-value]')]; const current=items.findIndex(i=>i.getAttribute('aria-selected')==='true');
      if(e.key==='Escape') close();
      if(e.key==='ArrowDown'){ e.preventDefault(); (items[Math.min(items.length-1,current+1)]||items[0]).focus(); }
      if(e.key==='ArrowUp'){ e.preventDefault(); (items[Math.max(0,current-1)]||items[0]).focus(); }
      if(e.key==='Enter' || e.key===' '){ e.preventDefault(); const el=document.activeElement.closest('[data-value]')||items[current]; if(el) el.click(); }
    });
  }

  function syncCustomSelect(id,value,label){
    const wrap=document.querySelector('.select-wrap[data-select="'+id+'"]');
    const btn=wrap.querySelector('.select-toggle');
    const menu=wrap.querySelector('.select-menu');
    const native=document.getElementById(id);
    native.value=value; btn.textContent=label;
    menu.querySelectorAll('[aria-selected]').forEach(el=>el.setAttribute('aria-selected', String(el.getAttribute('data-value')===value)));
  }

  function showNotification(msg){
    const note=document.createElement('div');
    note.className='notification'; note.textContent=msg;
    document.body.appendChild(note); requestAnimationFrame(()=>note.classList.add('show'));
    setTimeout(()=>{ note.classList.remove('show'); setTimeout(()=>note.remove(),500); },4000);
  }

  function renderInvites(){
    const list=document.getElementById('invites-list'); if(!list) return;
    list.innerHTML=''; sessionInvites.forEach(email=>{ const item=document.createElement('div'); item.className='invite-item'; item.textContent=email; list.appendChild(item); });
  }

  function renderIncomingInvites(invites) {
    const list = document.getElementById('incoming-invites');
    if (!list) return;
    list.innerHTML = '';
    invites.forEach(inv => {
      const row = document.createElement('div');
      row.className = 'invite-item';
      row.textContent = `Приглашение от ${inv.fromUid}`;
      const btn = document.createElement('button');
      btn.textContent = 'Принять';
      btn.addEventListener('click', () => acceptInvite(inv.id, inv.fromUid));
      row.appendChild(btn);
      list.appendChild(row);
    });
  }

  function openFriendModal(){
    const modal=document.getElementById('friend-modal'); if(!modal) return;
    modal.hidden=false;
    const myEmailEl=document.getElementById('my-email');
    const me=window.__authUser && window.__authUser.email ? window.__authUser.email : '';
    if(myEmailEl) myEmailEl.textContent=me;
    renderInvites();
  }
  function closeFriendModal(){ const modal=document.getElementById('friend-modal'); if(modal) modal.hidden=true; }

async function addFriendAction() {
  if (!window.__authUser || !window.__authUser.email) {
    alert('Пожалуйста, войдите через Google.');
    return;
  }

  const input = document.getElementById('friend-email-input');
  const toEmailRaw = String(input ? input.value : '').trim().toLowerCase();
  const toEmailLc = normalizeEmail(toEmailRaw);
  const myEmailLc = normalizeEmail(window.__authUser.email || '');

  if (!toEmailRaw || toEmailLc === myEmailLc) {
    alert('Введите корректную почту друга.');
    return;
  }

  try {
    await addDoc(collection(db, 'invites'), {
      fromUid: window.__authUser.uid,
      toEmail_lc: toEmailLc,
      toEmail_raw_lc: toEmailRaw,
      status: 'pending',
      createdAt: serverTimestamp()
    });
  } catch (e) {
    console.error('Ошибка создания инвайта', e);
    alert('Ошибка создания инвайта: ' + (e?.message || e));
    return;
  }

  if (input) input.value = '';
  if (!sessionInvites.includes(toEmailLc)) sessionInvites.push(toEmailLc);
  renderInvites();
  showNotification('Инвайт отправлен. Человек увидит его после входа.');
}


  function watchIncomingInvites() {
    unsubscribeInvites();
    if (!window.__authUser || !window.__authUser.email) return;
    const myEmailLc = normalizeEmail(window.__authUser.email);
    const qRef = query(collection(db, 'invites'),
      where('toEmail_lc', '==', myEmailLc),
      where('status', '==', 'pending')
    );
    unsubInvites = onSnapshot(qRef, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderIncomingInvites(items);
    });
  }

  async function acceptInvite(inviteId, fromUid) {
    if (!window.__authUser) return;
    try {
      await updateDoc(doc(db, 'users', window.__authUser.uid), { teamUid: fromUid });
      await updateDoc(doc(db, 'invites', inviteId), { status: 'accepted' });
      showNotification('Команда связана');
      if (currentUid) startRealtime(currentUid);
    } catch (e) {
      console.error('Ошибка принятия инвайта', e);
      alert('Ошибка принятия инвайта: ' + (e?.message || e));
    }
  }

  async function leaveTeamAction(){
    if(!window.__authUser) return;
    const myUid=window.__authUser.uid;
    try{
      await updateDoc(doc(db,'users',myUid), {teamUid:null});
    }catch(e){
      alert('Не удалось выйти из Team: ' + (e?.message || e));
      return;
    }
    teamUid=null; showNotification('Вы вышли из Team'); closeFriendModal(); if(currentUid) startRealtime(currentUid);
  }

  async function startRealtime(ownerUid){
    unsubscribe(); currentUid=ownerUid;
    const uids=[ownerUid];
    try{
      const ud=await getDoc(doc(db,'users',ownerUid));
      if(ud && ud.exists()){
        const data=ud.data();
        if(data.teamUid){ teamUid=data.teamUid; if(!uids.includes(teamUid)) uids.push(teamUid); }
        else teamUid=null;
      } else teamUid=null;
    }catch(_){}

    let qRef;
    if(uids.length===1) qRef=query(collection(db,'rentals'), where('ownerUid','==',ownerUid));
    else qRef=query(collection(db,'rentals'), where('ownerUid','in',uids));

    unsub=onSnapshot(qRef,(snap)=>{
      const items=snap.docs.map(d=>{
        const data=d.data(); const oUid=data.ownerUid||'';
        return {
          id:d.id,
          nickname:data.nickname||'',
          expiresMs: typeof data.expiresMs==='number' ? data.expiresMs : 0,
          tier:data.tier||'shared',
          ownerUid:oUid,
          notified:!!data.notified,
          team: teamUid && oUid===teamUid
        };
      }).sort((a,b)=>a.expiresMs-b.expiresMs);
      renderUsers(items);
    });
  }

  function init(){
    if('Notification' in window) Notification.requestPermission();
    initCustomSelect('durationUnit');
    document.getElementById('add-shared-button').addEventListener('click',()=>addUser('shared'));
    document.getElementById('add-solo-button').addEventListener('click',()=>addUser('solo'));
    window.addEventListener('resize',()=>{ clearTimeout(resizeTimer); resizeTimer=setTimeout(applyContainerScroll,180); });
    document.addEventListener('auth:ready',(e)=>{ const uid=e.detail && e.detail.uid ? e.detail.uid : null; if(uid) startRealtime(uid); watchIncomingInvites(); showNotification('Успешный вход'); });
    document.addEventListener('auth:logout',()=>{ unsubscribe(); unsubscribeInvites(); renderUsers([]); teamUid=null; currentUid=null; });
    document.addEventListener('friend:toggle',()=>{ const m=document.getElementById('friend-modal'); if(!m) return; if(m.hidden) openFriendModal(); else closeFriendModal(); });
    const addBtn=document.getElementById('add-friend-confirm'); if(addBtn) addBtn.addEventListener('click', addFriendAction);
    const leaveBtn=document.getElementById('leave-team'); if(leaveBtn) leaveBtn.addEventListener('click', leaveTeamAction);
    const modal=document.getElementById('friend-modal'); if(modal){ modal.addEventListener('mousedown',(e)=>{ if(e.target===modal) closeFriendModal(); }); }
  }

  document.addEventListener('DOMContentLoaded', init);
})();

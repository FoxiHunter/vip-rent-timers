import { db } from "./firebase.js";
import { collection, addDoc, serverTimestamp, onSnapshot, query, deleteDoc, doc, where, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

(function () {
  let activeIntervals = [];
  let resizeTimer = null;
  let unsub = null;
  let expiredFilter = 'all';

  function clearAllIntervals(){ for (const id of activeIntervals) clearInterval(id); activeIntervals = []; }
  function unsubscribe(){ if (typeof unsub === "function"){ try {unsub();} catch(_){} unsub = null; } }

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

  function formatDate(ms){
    const d = new Date(ms);
    const f = new Intl.DateTimeFormat('ru-RU', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'});
    return f.format(d);
  }

  function rangeForFilter(key){
    const now=new Date();
    const startOfDay=d=>{const x=new Date(d);x.setHours(0,0,0,0);return x.getTime();};
    const shiftDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;};
    if(key==='today'){return {from:startOfDay(now), to:now.getTime()};}
    if(key==='yesterday'){const s=startOfDay(shiftDays(now,-1));const e=startOfDay(now);return {from:s,to:e};}
    if(key==='daybefore'){const s=startOfDay(shiftDays(now,-2));const e=startOfDay(shiftDays(now,-1));return {from:s,to:e};}
    if(key==='week'){return {from:now.getTime()-7*24*3600*1000,to:now.getTime()};}
    if(key==='month'){return {from:now.getTime()-30*24*3600*1000,to:now.getTime()};}
    return {from:-Infinity,to:now.getTime()};
  }

  function applyExpiredFilter(){
    const r=rangeForFilter(expiredFilter);
    ['expired-shared','expired-solo'].forEach(id=>{
      const box=document.getElementById(id);
      [...box.children].forEach(card=>{
        const ms=Number(card.dataset.expires);
        const show=ms>=r.from && ms<=r.to;
        card.style.display=show?'':'none';
      });
    });
  }

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
      card.dataset.expires=String(user.expiresMs);
      card.innerHTML = `
        <div class="card-top">
          <div class="nick"></div>
          <div class="status-badge"></div>
        </div>
        <div class="expires-at"></div>
        <div class="time-left"></div>
        <div class="actions-row"><button class="delete">Удалить</button></div>
      `;

      const nick=card.querySelector('.nick');
      const badge=card.querySelector('.status-badge');
      const timeLeft=card.querySelector('.time-left');
      const expiresAtEl=card.querySelector('.expires-at');
      const del=card.querySelector('.delete');

      nick.textContent=user.nickname;
      badge.textContent='Активно';
      expiresAtEl.textContent='Окончание: ' + formatDate(user.expiresMs);

      del.addEventListener('click', async()=>{
        const me=window.__authUser && window.__authUser.uid ? window.__authUser.uid : null;
        if(!me || me!==user.ownerUid){ alert('Удалять может только владелец записи.'); return; }
        try{ await deleteDoc(doc(db,'rentals',user.id)); }catch(_){ alert('Ошибка удаления'); }
      });

      async function updateTime(){
        const now=Date.now();
        const diff=user.expiresMs-now;
        expiresAtEl.textContent='Окончание: ' + formatDate(user.expiresMs);

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
            if('Notification' in window && Notification.permission==='granted'){ try{ new Notification('Аренда просрочена',{body:user.nickname}); }catch(_){ } }
          }
          applyExpiredFilter();
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
    applyExpiredFilter();
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
      return Math.min(d.getTime(), now.getTime(), now.getTime() + 10 * 365 * 24 * 3600 * 1000);
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
  }

  function initCustomSelect(id){
    const wrap=document.querySelector('.select-wrap[data-select="'+id+'"]');
    const btn=wrap.querySelector('.select-toggle');
    const menu=wrap.querySelector('.select-menu');
    const native=document.getElementById(id);
    const panel=wrap.closest('.panel');
    function close(){ btn.setAttribute('aria-expanded','false'); menu.classList.remove('open'); wrap.classList.remove('open'); if(panel) panel.classList.remove('bring-to-front'); }
    function open(){ btn.setAttribute('aria-expanded','true'); menu.classList.add('open'); wrap.classList.add('open'); if(panel) panel.classList.add('bring-to-front'); menu.focus(); }
    btn.addEventListener('click',()=>{ menu.classList.contains('open')?close():open(); });
    menu.addEventListener('click',e=>{
      const li=e.target.closest('[data-value]'); if(!li) return;
      const value=li.getAttribute('data-value'); const label=li.textContent.trim();
      native.value=value; btn.textContent=label;
      menu.querySelectorAll('[aria-selected="true"]').forEach(el=>el.setAttribute('aria-selected','false'));
      li.setAttribute('aria-selected','true'); close();
      native.dispatchEvent(new Event('change',{bubbles:true}));
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

  function startRealtime(ownerUid){
    unsubscribe();
    const qRef=query(collection(db,'rentals'), where('ownerUid','==',ownerUid));
    unsub=onSnapshot(qRef,(snap)=>{
      const items=snap.docs.map(d=>{
        const data=d.data();
        return {id:d.id,nickname:data.nickname||'',expiresMs: typeof data.expiresMs==='number' ? data.expiresMs : 0,tier:data.tier||'shared',ownerUid:data.ownerUid||'',notified:!!data.notified};
      }).sort((a,b)=>a.expiresMs-b.expiresMs);
      renderUsers(items);
    });
  }

  function init(){
    if('Notification' in window) Notification.requestPermission();
    initCustomSelect('durationUnit');
    initCustomSelect('expiredFilter');
    document.getElementById('add-shared-button').addEventListener('click',()=>addUser('shared'));
    document.getElementById('add-solo-button').addEventListener('click',()=>addUser('solo'));
    const ef=document.getElementById('expiredFilter');
    ef.addEventListener('change',()=>{ expiredFilter=ef.value; applyExpiredFilter(); });
    window.addEventListener('resize',()=>{ clearTimeout(resizeTimer); resizeTimer=setTimeout(applyContainerScroll,180); });
    document.addEventListener('auth:ready',(e)=>{ const uid=e.detail && e.detail.uid ? e.detail.uid : null; if(uid) startRealtime(uid); });
    document.addEventListener('auth:logout',()=>{ unsubscribe(); renderUsers([]); });
  }

  document.addEventListener('DOMContentLoaded', init);
})();

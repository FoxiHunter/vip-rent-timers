import { db } from "./firebase.js";
import { collection, addDoc, serverTimestamp, onSnapshot, query, deleteDoc, doc, where, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

(function () {
  let activeIntervals = [];
  let resizeTimer = null;
  let unsub = null;

  function clearAllIntervals() {
    for (const id of activeIntervals) clearInterval(id);
    activeIntervals = [];
  }

  function unsubscribe() {
    if (typeof unsub === "function") {
      try { unsub(); } catch(e) {}
      unsub = null;
    }
  }

  function applyContainerScroll() {
    const containers = document.querySelectorAll('.cards-container');
    containers.forEach(container => {
      const items = Array.from(container.children);
      if (items.length <= 2) {
        container.style.maxHeight = '';
        container.style.overflowY = '';
        return;
      }
      const gap = parseFloat(getComputedStyle(container).rowGap || '0');
      const firstTwo = items.slice(0, 2);
      const sum = firstTwo.reduce((acc, el) => acc + el.getBoundingClientRect().height, 0);
      const maxH = sum + gap * 1;
      container.style.maxHeight = maxH + 'px';
      container.style.overflowY = 'auto';
    });
  }

  function renderUsers(users) {
    clearAllIntervals();
    const acShared = document.getElementById('active-shared');
    const acSolo = document.getElementById('active-solo');
    const exShared = document.getElementById('expired-shared');
    const exSolo = document.getElementById('expired-solo');
    acShared.innerHTML = '';
    acSolo.innerHTML = '';
    exShared.innerHTML = '';
    exSolo.innerHTML = '';

    users.forEach((user) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = '<div class="card-top"><div class="nick"></div><div class="status-badge"></div></div><div class="time-left"></div><div class="actions-row"><button class="delete">Удалить</button></div>';

      const nick = card.querySelector('.nick');
      const badge = card.querySelector('.status-badge');
      const timeLeft = card.querySelector('.time-left');
      const del = card.querySelector('.delete');

      nick.textContent = user.nickname;
      badge.textContent = 'Активно';

      del.addEventListener('click', async () => {
        const me = window.__authUser && window.__authUser.uid ? window.__authUser.uid : null;
        if (!me || me !== user.ownerUid) {
          alert('Удалять может только владелец записи.');
          return;
        }
        try { await deleteDoc(doc(db, 'rentals', user.id)); } catch(e) { alert('Ошибка удаления'); }
      });

      async function updateTime() {
        const now = Date.now();
        const diff = user.expiresMs - now;
        if (diff <= 0) {
          if (user.tier === 'solo') exSolo.appendChild(card);
          else exShared.appendChild(card);
          card.classList.add('expired');
          badge.textContent = 'Просрочено';
          timeLeft.textContent = 'Оставшееся время: 0с';
          if (!user.notified) {
            try { await updateDoc(doc(db, 'rentals', user.id), { notified: true }); } catch(e) {}
            const audio = document.getElementById('notificationSound');
            if (audio) {
              audio.currentTime = 0;
              audio.play();
              setTimeout(() => { try { audio.pause(); audio.currentTime = 0; } catch(e) {} }, 5000);
            }
          }
          return;
        }
        const seconds = Math.floor((diff / 1000) % 60);
        const minutes = Math.floor((diff / (1000 * 60)) % 60);
        const hours = Math.floor((diff / (1000 * 60 * 60)));
        if (user.tier === 'solo') acSolo.appendChild(card);
        else acShared.appendChild(card);
        card.classList.remove('expired');
        badge.textContent = 'Активно';
        timeLeft.textContent = 'Оставшееся время: ' + hours + 'ч ' + minutes + 'м ' + seconds + 'с';
      }

      updateTime();
      const id = setInterval(updateTime, 1000);
      activeIntervals.push(id);
    });

    applyContainerScroll();
  }

  async function addUser(tier) {
    if (!window.__authUser) {
      alert('Пожалуйста, войдите через Google, чтобы добавлять аренды.');
      return;
    }
    const nicknameInput = document.getElementById('nickname');
    const valueInput = document.getElementById('durationValue');
    const unitSelect = document.getElementById('durationUnit');
    const nickname = nicknameInput.value.trim();
    const value = parseFloat(valueInput.value.trim());
    const unit = unitSelect.value;
    if (!nickname || isNaN(value) || value <= 0) {
      alert('Пожалуйста, введите корректные данные.');
      return;
    }
    const now = Date.now();
    const expiresMs = unit === 'minutes' ? now + value * 60 * 1000 : now + value * 60 * 60 * 1000;
    try {
      await addDoc(collection(db, 'rentals'), {
        nickname,
        expiresMs,
        tier,
        ownerUid: window.__authUser.uid,
        notified: false,
        createdAt: serverTimestamp()
      });
    } catch (e) {
      alert('Ошибка добавления');
      return;
    }
    nicknameInput.value = '';
    valueInput.value = '';
    unitSelect.value = 'hours';
    syncCustomSelect('durationUnit', 'hours', 'Часы');
  }

  function initCustomSelect(id) {
    const wrap = document.querySelector('.select-wrap[data-select="' + id + '"]');
    const btn = wrap.querySelector('.select-toggle');
    const menu = wrap.querySelector('.select-menu');
    const native = document.getElementById(id);

    function close() {
      btn.setAttribute('aria-expanded', 'false');
      menu.classList.remove('open');
    }

    function open() {
      btn.setAttribute('aria-expanded', 'true');
      menu.classList.add('open');
      menu.focus();
    }

    btn.addEventListener('click', () => {
      if (menu.classList.contains('open')) close(); else open();
    });

    menu.addEventListener('click', e => {
      const li = e.target.closest('[data-value]');
      if (!li) return;
      const value = li.getAttribute('data-value');
      const label = li.textContent.trim();
      native.value = value;
      btn.textContent = label;
      menu.querySelectorAll('[aria-selected="true"]').forEach(el => el.setAttribute('aria-selected', 'false'));
      li.setAttribute('aria-selected', 'true');
      close();
    });

    document.addEventListener('click', e => {
      if (!wrap.contains(e.target)) close();
    });

    menu.addEventListener('keydown', e => {
      const items = Array.from(menu.querySelectorAll('[data-value]'));
      const current = items.findIndex(i => i.getAttribute('aria-selected') === 'true');
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const idx = Math.min(items.length - 1, current + 1);
        items[idx].focus();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = Math.max(0, current - 1);
        items[idx].focus();
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const el = document.activeElement.closest('[data-value]') || items[current];
        if (el) el.click();
      }
    });
  }

  function syncCustomSelect(id, value, label) {
    const wrap = document.querySelector('.select-wrap[data-select="' + id + '"]');
    const btn = wrap.querySelector('.select-toggle');
    const menu = wrap.querySelector('.select-menu');
    const native = document.getElementById(id);
    native.value = value;
    btn.textContent = label;
    menu.querySelectorAll('[aria-selected]').forEach(el => {
      el.setAttribute('aria-selected', String(el.getAttribute('data-value') === value));
    });
  }

  function startRealtime(ownerUid) {
    unsubscribe();
    const q = query(collection(db, 'rentals'), where('ownerUid', '==', ownerUid));
    unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map(d => {
        const data = d.data();
        return { id: d.id, nickname: data.nickname || '', expiresMs: typeof data.expiresMs === 'number' ? data.expiresMs : 0, tier: data.tier || 'shared', ownerUid: data.ownerUid || '', notified: !!data.notified };
      }).sort((a,b) => a.expiresMs - b.expiresMs);
      renderUsers(items);
    });
  }

  function init() {
    if ('Notification' in window) Notification.requestPermission();
    initCustomSelect('durationUnit');
    document.getElementById('add-shared-button').addEventListener('click', () => addUser('shared'));
    document.getElementById('add-solo-button').addEventListener('click', () => addUser('solo'));
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(applyContainerScroll, 180);
    });
    document.addEventListener('auth:ready', (e) => {
      const uid = e.detail && e.detail.uid ? e.detail.uid : null;
      if (uid) startRealtime(uid);
    });
    document.addEventListener('auth:logout', () => {
      unsubscribe();
      renderUsers([]);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();

import { auth, db, provider } from "./firebase.js";
import { onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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

function ensureUI() {
  const header = document.querySelector(".app-header");
  let row = header.querySelector(".header-row");
  if (!row) {
    row = document.createElement("div");
    row.className = "header-row";
    const left = document.createElement("div");
    while (header.firstChild) left.appendChild(header.firstChild);
    row.appendChild(left);
    header.appendChild(row);
  }
  let box = document.getElementById("auth-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "auth-box";
    box.className = "auth-box";
    row.appendChild(box);
  }
  let signInBtn = document.getElementById("sign-in-btn");
  if (!signInBtn) {
    signInBtn = document.createElement("button");
    signInBtn.id = "sign-in-btn";
    signInBtn.className = "btn primary";
    signInBtn.textContent = "Войти";
    box.appendChild(signInBtn);
  }
  let indicator = document.getElementById("auth-indicator");
  if (!indicator) {
    indicator = document.createElement("span");
    indicator.id = "auth-indicator";
    indicator.style.display = "inline-block";
    indicator.style.width = "10px";
    indicator.style.height = "10px";
    indicator.style.borderRadius = "999px";
    indicator.style.background = "var(--success)";
    indicator.style.boxShadow = "0 0 0 2px rgba(64,224,160,.25)";
    indicator.style.margin = "0 8px";
    indicator.hidden = true;
    box.appendChild(indicator);
  }
  let signOutBtn = document.getElementById("sign-out-btn");
  if (!signOutBtn) {
    signOutBtn = document.createElement("button");
    signOutBtn.id = "sign-out-btn";
    signOutBtn.className = "btn secondary";
    signOutBtn.textContent = "Выйти";
    signOutBtn.hidden = true;
    box.appendChild(signOutBtn);
  }
  let friendBtn = document.getElementById("friend-btn");
  if (!friendBtn) {
    friendBtn = document.createElement("button");
    friendBtn.id = "friend-btn";
    friendBtn.className = "btn friend-btn";
    friendBtn.textContent = "🤝";
    friendBtn.title = "Добавить друга";
    friendBtn.hidden = true;
    box.appendChild(friendBtn);
  }
  return { signInBtn, signOutBtn, indicator, friendBtn };
}

function bind({ signInBtn, signOutBtn, indicator, friendBtn }) {
  signInBtn.addEventListener("click", async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      alert("Ошибка входа: " + (e && e.message ? e.message : e));
    }
  });
  signOutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (e) {
      alert("Ошибка выхода: " + (e && e.message ? e.message : e));
    }
  });

  signOutBtn.hidden = true;
  signInBtn.hidden = false;
  indicator.hidden = true;
  if (friendBtn) friendBtn.hidden = true;

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      signInBtn.hidden = true;
      signOutBtn.hidden = false;
      indicator.hidden = false;
      if (friendBtn) friendBtn.hidden = false;

      window.__authUser = {
        uid: user.uid,
        displayName: user.displayName || "",
        email: user.email || ""
      };

      try {
        await setDoc(
          doc(db, "users", user.uid),
          {
            displayName: user.displayName || "",
            email: user.email || "",
            email_lc: normalizeEmail(user.email || ""),
            lastLoginAt: serverTimestamp(),
            createdAt: serverTimestamp()
          },
          { merge: true }
        );
      } catch (e) {}

      document.dispatchEvent(new CustomEvent("auth:ready", { detail: window.__authUser }));
    } else {
      signOutBtn.hidden = true;
      signInBtn.hidden = false;
      indicator.hidden = true;
      if (friendBtn) friendBtn.hidden = true;
      window.__authUser = null;
      document.dispatchEvent(new CustomEvent("auth:logout"));
    }
  });

  if (friendBtn) {
    friendBtn.addEventListener("click", () => {
      document.dispatchEvent(new Event("friend:toggle"));
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const ui = ensureUI();
  bind(ui);
});

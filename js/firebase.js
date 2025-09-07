import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB2LQsJuE0-vqD80Rcqqpav-jxlapYrcpg",
  authDomain: "gameassets-library-f1f0d.firebaseapp.com",
  projectId: "gameassets-library-f1f0d",
  appId: "1:33160635214:web:a7b6873dae71dc3e73f41f"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

window.__firebase = { app, auth, db, provider };

export { app, auth, db, provider };

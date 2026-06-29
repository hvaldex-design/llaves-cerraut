// ============================================================
// firebase.js — conexión a Firebase (login + base de datos)
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const cfg = window.APP_CONFIG.firebase;
const app = initializeApp(cfg);
export const auth = getAuth(app);
export const db = getFirestore(app);

export function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}

export function logout() {
  return signOut(auth);
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

// Cada usuario solo ve sus propios datos: todo vive bajo /usuarios/{uid}/...
function userCollection(uid, name) {
  return collection(db, "usuarios", uid, name);
}

export function watchCollection(uid, name, callback, orderField = "creadoEn") {
  const q = query(userCollection(uid, name), orderBy(orderField, "desc"));
  return onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    callback(items);
  }, (err) => {
    console.error(`Error escuchando ${name}:`, err);
    callback([], err);
  });
}

export async function addItem(uid, name, data) {
  return addDoc(userCollection(uid, name), {
    ...data,
    creadoEn: serverTimestamp()
  });
}

export async function updateItem(uid, name, id, data) {
  return updateDoc(doc(db, "usuarios", uid, name, id), data);
}

export async function deleteItem(uid, name, id) {
  return deleteDoc(doc(db, "usuarios", uid, name, id));
}

export { where };

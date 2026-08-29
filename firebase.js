// ============================================================
// firebase.js — conexión a Firebase (login + base de datos)
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, addDoc, updateDoc, deleteDoc, setDoc, getDoc,
  onSnapshot, query, orderBy, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const cfg = window.APP_CONFIG.firebase;
const app = initializeApp(cfg);
export const auth = getAuth(app);

// Caché persistente: la app abre y funciona sin señal, y sincroniza sola cuando
// vuelve la conexión. Si el navegador no lo soporta, cae a la versión en memoria.
export let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
} catch (e) {
  console.warn("Sin caché offline persistente, se usa la de memoria:", e);
  db = initializeFirestore(app, {});
}

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

function userDoc(uid, name, id) {
  return doc(db, "usuarios", uid, name, id);
}

/**
 * Escucha una colección en tiempo real.
 * El callback recibe (items, meta) donde meta = { error, desdeCache, pendiente }.
 * Ante un error NO se entregan datos: se avisa y se conserva lo último bueno,
 * porque una lista vacía se confunde con "no tienes nada guardado".
 */
export function watchCollection(uid, name, callback, orderField = "creadoEn") {
  const q = query(userCollection(uid, name), orderBy(orderField, "desc"));
  return onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    callback(items, {
      error: null,
      desdeCache: snap.metadata.fromCache,
      pendiente: snap.metadata.hasPendingWrites
    });
  }, (err) => {
    console.error(`Error escuchando ${name}:`, err);
    callback(null, { error: err, desdeCache: true, pendiente: false });
  });
}

export async function addItem(uid, name, data) {
  return addDoc(userCollection(uid, name), {
    ...data,
    creadoEn: serverTimestamp()
  });
}

export async function updateItem(uid, name, id, data) {
  return updateDoc(userDoc(uid, name, id), data);
}

export async function deleteItem(uid, name, id) {
  return deleteDoc(userDoc(uid, name, id));
}

// ---------- Documento único de configuración del taller ----------
// Vive en /usuarios/{uid}/config/taller para que el nombre, el logo y los
// precios viajen con la cuenta a cualquier dispositivo.

export async function getConfigTaller(uid) {
  const snap = await getDoc(doc(db, "usuarios", uid, "config", "taller"));
  return snap.exists() ? snap.data() : null;
}

export async function saveConfigTaller(uid, data) {
  return setDoc(doc(db, "usuarios", uid, "config", "taller"), data, { merge: true });
}

// ---------- Escrituras en lote ----------
// Aplica varios ajustes de stock como una sola operación atómica: o entran
// todos o no entra ninguno. Recibe [{ id, stock }, ...].
export async function aplicarStockEnLote(uid, cambios) {
  if (!cambios.length) return;
  const batch = writeBatch(db);
  for (const { id, stock } of cambios) {
    batch.update(userDoc(uid, "inventario", id), { stock });
  }
  return batch.commit();
}

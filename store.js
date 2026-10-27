// Collegamento a Firebase: login e database (Firestore). Anche i PDF stanno in Firestore,
// divisi in pezzi: così basta il piano gratuito Spark, senza carta di credito.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut,
  signInWithEmailAndPassword, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, getDoc, getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, ADMIN_EMAILS } from "./firebase-config.js?v=20261027e";

export const configured = !!(firebaseConfig && firebaseConfig.apiKey && !/^INSERISCI/.test(firebaseConfig.apiKey));

let auth = null, fs = null;
if (configured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  fs = getFirestore(app);
  getRedirectResult(auth).catch(e => console.error(e));
}

// Firestore sostituisce gli oggetti annidati: li trasformo in percorsi "a.b" così un aggiornamento
// di files.identita non cancella le altre cartelle.
const isObj = v => v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date);
function flatten(o, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(o)) {
    const key = prefix ? prefix + "." + k : k;
    if (isObj(v) && Object.keys(v).length) flatten(v, key, out); else out[key] = v;
  }
  return out;
}

function docRef(path, id) {
  const r = doc(fs, path, id);
  return {
    id: r.id,
    set: d => setDoc(r, d),
    update: d => updateDoc(r, flatten(d)),
    delete: () => deleteDoc(r),
    get: async () => { const s = await getDoc(r); return { id: s.id, exists: s.exists(), data: () => s.data() }; }
  };
}

export const db = {
  collection(path) {
    return {
      onSnapshot: (next, err) => onSnapshot(collection(fs, path), next, err),
      doc: id => docRef(path, id || doc(collection(fs, path)).id)
    };
  }
};

// PDF in Firestore: pdf/{id} contiene i dati del file, pdf/{id}/parti/{000,001,…} i pezzi in base64.
// Un documento Firestore può pesare al massimo 1 MB: 700 KB di file diventano circa 935 KB in base64.
const CHUNK = 700 * 1024;
const MAX_BYTES = 20 * 1024 * 1024;
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/[^a-z0-9]/gi, "");
const partId = i => String(i).padStart(3, "0");

function toB64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function fromB64(b64) {
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function removeParts(id) {
  const snap = await getDocs(collection(fs, "pdf", id, "parti"));
  for (const d of snap.docs) await deleteDoc(d.ref);
}

async function writePdf(id, blob) {
  if (blob.size > MAX_BYTES) { const e = new Error("too_large"); e.code = "too_large"; throw e; }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const parts = Math.max(1, Math.ceil(bytes.length / CHUNK));
  await removeParts(id);
  for (let i = 0; i < parts; i++) {
    await setDoc(doc(fs, "pdf", id, "parti", partId(i)), { d: toB64(bytes.subarray(i * CHUNK, (i + 1) * CHUNK)) });
  }
  // Il documento principale si scrive per ultimo: se manca, il file non è completo.
  await setDoc(doc(fs, "pdf", id), { parti: parts, size: bytes.length, tipo: "application/pdf", caricato: new Date().toISOString() });
  return { id, sizeBytes: bytes.length };
}

export const assets = {
  upload: file => writePdf(newId(), file),
  uploadWithId: (id, blob) => writePdf(id, blob),
  async delete(id) {
    await deleteDoc(doc(fs, "pdf", id));
    await removeParts(id);
    return { deleted: true };
  }
};

export async function getFile(id) {
  const meta = await getDoc(doc(fs, "pdf", id));
  if (!meta.exists()) { const e = new Error("missing"); e.code = "missing"; throw e; }
  const snap = await getDocs(collection(fs, "pdf", id, "parti"));
  const parts = snap.docs.slice().sort((a, b) => a.id.localeCompare(b.id)).map(d => fromB64(d.data().d));
  if (parts.length !== meta.data().parti) { const e = new Error("incomplete"); e.code = "missing"; throw e; }
  return new Blob(parts, { type: "application/pdf" });
}

export function saveBlob(blob, filename) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = u; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 60000);
}

export const downloads = {
  async save({ filename, data }) { saveBlob(data, filename); return { status: "saved" }; }
};

export async function batchSet(items) {
  for (let i = 0; i < items.length; i += 400) {
    const b = writeBatch(fs);
    items.slice(i, i + 400).forEach(it => b.set(doc(fs, it.path, it.id), it.data));
    await b.commit();
  }
}

export const watchAuth = cb => onAuthStateChanged(auth, cb);

export async function login() {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: "select_account" });
  try { await signInWithPopup(auth, p); }
  catch (e) {
    if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment", "auth/cancelled-popup-request"].includes(e.code)) await signInWithRedirect(auth, p);
    else throw e;
  }
}

export const logout = () => signOut(auth);

export const loginEmail = (email, password) => signInWithEmailAndPassword(auth, email.trim(), password);
export const resetPassword = email => { auth.languageCode = "it"; return sendPasswordResetEmail(auth, email.trim()); };

// Gli account con password li crea l'amministrazione dalla console Firebase (la registrazione libera è disattivata),
// quindi valgono anche se l'email non è stata verificata. Per Google serve l'email verificata.
const viaPassword = u => (u.providerData || []).some(p => p.providerId === "password");
export const isAllowed = u => !!u && (u.emailVerified || viaPassword(u)) &&
  ADMIN_EMAILS.map(x => x.toLowerCase()).includes((u.email || "").toLowerCase());

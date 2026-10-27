// Collegamento a Firebase: login, database (Firestore) e PDF (Storage).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, getDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getBlob, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { firebaseConfig, ADMIN_EMAILS } from "./firebase-config.js";

export const configured = !!(firebaseConfig && firebaseConfig.apiKey && !/^INSERISCI/.test(firebaseConfig.apiKey));

let auth = null, fs = null, st = null;
if (configured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  fs = getFirestore(app);
  st = getStorage(app);
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

const fileRef = id => ref(st, `files/${id}.pdf`);
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/[^a-z0-9]/gi, "");

export const assets = {
  async upload(file) {
    const id = newId();
    await uploadBytes(fileRef(id), file, { contentType: "application/pdf" });
    return { id, sizeBytes: file.size };
  },
  async uploadWithId(id, blob) {
    await uploadBytes(fileRef(id), blob, { contentType: "application/pdf" });
  },
  async delete(id) {
    try { await deleteObject(fileRef(id)); }
    catch (e) { if (e.code !== "storage/object-not-found") throw e; }
    return { deleted: true };
  }
};

export async function getFile(id) {
  const b = await getBlob(fileRef(id));
  return b.type === "application/pdf" ? b : new Blob([b], { type: "application/pdf" });
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

export const isAllowed = u => !!u && u.emailVerified &&
  ADMIN_EMAILS.map(x => x.toLowerCase()).includes((u.email || "").toLowerCase());

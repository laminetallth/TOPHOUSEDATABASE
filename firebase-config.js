// Configurazione Firebase della piattaforma.
// Dove trovarla: console.firebase.google.com → il tuo progetto → ⚙ Impostazioni progetto →
// "Le tue app" → app web → "Configurazione SDK" → copia i valori qui sotto.
// Questi valori non sono segreti: i dati sono protetti dal login e dalle regole di sicurezza.
export const firebaseConfig = {
  apiKey: "INSERISCI_API_KEY",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

// Account Google che possono entrare.
// Devono essere gli stessi scritti in firestore.rules e storage.rules.
export const ADMIN_EMAILS = [
  "laminetall.th@gmail.com"
];

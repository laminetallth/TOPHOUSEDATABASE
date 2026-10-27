// Configurazione Firebase della piattaforma.
// Dove trovarla: console.firebase.google.com → il tuo progetto → ⚙ Impostazioni progetto →
// "Le tue app" → app web → "Configurazione SDK" → copia i valori qui sotto.
// Questi valori non sono segreti: i dati sono protetti dal login e dalle regole di sicurezza.
export const firebaseConfig = {
  apiKey: "AIzaSyBkfFwt5sqKKYdr4QeuTPWqrIY54ImAvPI",
  authDomain: "top-house-database.firebaseapp.com",
  projectId: "top-house-database",
  storageBucket: "top-house-database.firebasestorage.app",
  messagingSenderId: "1036742504337",
  appId: "1:1036742504337:web:d3ce461d3fe3c56354f430"
};

// Account Google che possono entrare.
// Devono essere gli stessi scritti in firestore.rules e storage.rules.
export const ADMIN_EMAILS = [
  "laminetall.th@gmail.com",
  "gabrielestraniero.th@gmail.com"
];

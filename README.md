# Top House – Archivio venditori

Piattaforma dell'amministrazione Top House per gestire i venditori: anagrafica, codice fiscale, IBAN, piano compensi, documenti d'identità, contratti, fatture, promemoria, piani compensi pronti e accessi ai portali.

- **Sito**: GitHub Pages (questa cartella)
- **Login**: email e password (account creati dalla console Firebase) oppure Google; entrano solo gli account autorizzati
- **Dati**: Firebase Firestore
- **PDF**: dentro Firestore, divisi in pezzi (piano gratuito, senza carta)

In questo repository c'è **solo il codice**. Nessun dato personale: i dati stanno su Firebase, protetti dal login e dalle regole di sicurezza. I file `.zip` e `.pdf` sono esclusi da Git apposta.

## Attivazione (una volta sola)

### 1. Progetto Firebase
Vai su [console.firebase.google.com](https://console.firebase.google.com) e apri il progetto da usare (può essere quello esistente o uno nuovo, es. `top-house-database`).

### 2. Login con Google
**Authentication → Metodo di accesso → Google → Attiva.**
Poi **Authentication → Impostazioni → Domini autorizzati → Aggiungi dominio**: `laminetallth.github.io`

### 3. Database
**Firestore Database → Crea database** (località `europe-west1` o `eur3`, modalità produzione).
Scheda **Regole**: incolla il contenuto di [`firestore.rules`](firestore.rules) e premi **Pubblica**.

### 4. PDF
Non serve Storage né il piano Blaze: i PDF vengono salvati dentro Firestore, divisi in pezzi da 700 KB (raccolta `pdf`). Basta il piano gratuito Spark (1 GB di spazio).

### 5. Collegare il sito
**⚙ Impostazioni progetto → Le tue app → Aggiungi app → Web (`</>`)**. Copia i valori di `firebaseConfig` dentro [`firebase-config.js`](firebase-config.js).

### 6. Pubblicare il sito
Su GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / root → Save**.
GitHub Pages su un repository **privato** richiede GitHub Pro. In alternativa si può rendere il repository pubblico: contiene solo codice, i dati restano protetti su Firebase.

### 7. Importare i dati
Apri il sito, accedi con Google, tocca il tuo avatar in alto a destra → **Importa backup** → scegli `Backup_TopHouse_….zip`.

## Chi può entrare
L'elenco degli account autorizzati è in **due punti** e deve essere uguale in entrambi:
- `firebase-config.js` → `ADMIN_EMAILS`
- `firestore.rules` (poi ripubblica le regole dalla console Firebase)

## Backup
Dal menu dell'avatar: **Scarica backup** crea uno zip con tutte le schede e tutti i PDF. Conservalo in un posto sicuro: contiene documenti d'identità, codici fiscali, IBAN e password.

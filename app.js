import {configured,db as fdb,assets as fassets,downloads as fdownloads,getFile,saveBlob,watchAuth,login,loginEmail,resetPassword,logout,isAllowed,batchSet} from "./store.js?v=20261028a";

const ICON="assets/logo-icon.png";
const PIANI=["Piano Oro","Piano Argento","Piano Bronzo","STD","Personalizzato"];
const CATS=[
  {k:"piano",t:"Piano compensi",s:"Piano"},
  {k:"identita",t:"Documenti d'identità",s:"Identità"},
  {k:"contratto",t:"Contratto",s:"Contratto"},
  {k:"fatture",t:"Fatture ricevute",s:"Fatture"},
  {k:"altri",t:"Altre documentazioni",s:"Altro"}
];
const REQUIRED=["piano","identita","contratto"];
const TIPI={dire:"Da dire",mandare:"Da mandare",fare:"Da fare"};

let db=null, assets=null, downloads=null;
let venditori=[], selId=null, view="venditori", q="", ready=false, noDb=false;
let accessi=[], piani=[], qa="", azienda=null;
const AZ_ID="top-house";
let sdiAdded=false;
const revealed=new Set();
const ACC_CATS=["Gestori luce e gas","Telefonia","Portali e CRM","Email","Banca e pagamenti","Altro"];
const medal=n=>/oro/i.test(n)?"#C9A227":/argento/i.test(n)?"#A9ADB3":/bronzo/i.test(n)?"#B8733A":"";
const pianoNames=()=>[...new Set([...PIANI,...piani.map(p=>p.nome).filter(Boolean)])];
const normUrl=u=>{u=(u||"").trim();if(!u)return"";return /^https?:\/\//i.test(u)?u:"https://"+u};
const nowIso=()=>new Date().toISOString();
const ferr=m=>{const x=$("#f-err");if(x){x.textContent=m;x.hidden=false}};
let armed=null;
const queues={};

const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const full=v=>[v.nome,v.cognome].filter(Boolean).join(" ")||"Senza nome";
const ini=v=>(((v.nome||"?")[0]||"")+((v.cognome||"")[0]||"")).toUpperCase();
const today=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
const fmtD=s=>{if(!s)return"";const [y,m,d]=s.slice(0,10).split("-");return d+"/"+m+"/"+y};
const fmtSize=b=>b>1048576?(b/1048576).toFixed(1)+" MB":Math.max(1,Math.round(b/1024))+" KB";
const fmtIban=s=>(s||"").replace(/\s+/g,"").toUpperCase().replace(/(.{4})/g,"$1 ").trim();
const ibanOk=s=>{s=s.replace(/\s+/g,"").toUpperCase();if(!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s))return false;let r=0;for(const c of s.slice(4)+s.slice(0,4)){const d=parseInt(c,36);r=Number(String(r)+d)%97}return r===1};
const cfOk=s=>{if(!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(s))return false;const o=[1,0,5,7,9,13,15,17,19,21,2,4,18,20,11,3,6,8,12,14,16,10,22,25,24,23];let t=0;for(let i=0;i<15;i++){const c=s[i],v=/\d/.test(c)?+c:c.charCodeAt(0)-65;t+=i%2===0?o[v]:v}return String.fromCharCode(65+t%26)===s[15]};
const uid=()=>Math.random().toString(36).slice(2,10)+Date.now().toString(36);
const since=s=>{if(!s)return"";const d=new Date(s+"T00:00:00"),n=new Date();let m=(n.getFullYear()-d.getFullYear())*12+n.getMonth()-d.getMonth();if(n.getDate()<d.getDate())m--;if(m<0)return"inizia il "+fmtD(s);if(m<1)return"da meno di un mese";if(m<12)return"da "+m+(m===1?" mese":" mesi");const y=Math.floor(m/12);return"da "+y+(y===1?" anno":" anni")};

function toast(msg){const t=$("#toast");t.textContent=msg;t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,2600)}
const openRems=v=>(v.promemoria||[]).filter(r=>!r.fatto);
const dueRems=v=>{const t=today();return openRems(v).filter(r=>r.scadenza&&r.scadenza<=t)};
const filesOf=(v,k)=>(v.files&&v.files[k])||[];
// Piano Oro/Argento/Bronzo/STD: il PDF è unico e sta in "Piani compensi", sulla scheda non si allega niente.
// Piano personalizzato: ogni venditore ha il suo PDF, da caricare nella sua scheda.
const isPers=v=>/personalizzat/i.test(v.pianoNome||"");
const pianoOk=v=>!!v.pianoNome&&(!isPers(v)||filesOf(v,"piano").length>0);
const missing=v=>CATS.filter(c=>REQUIRED.includes(c.k)&&(c.k==="piano"?!pianoOk(v):!filesOf(v,c.k).length));

function write(id,fn){
  queues[id]=(queues[id]||Promise.resolve()).then(fn).catch(e=>{
    toast(e?.code==="quota_exceeded"?"Spazio esaurito: elimina qualche file e riprova":"Salvataggio non riuscito, riprova");
    console.error(e);
  });
  return queues[id];
}
const cur=()=>venditori.find(v=>v.id===selId);

// ---------- RENDER ----------
function render(){
  const nOpen=venditori.reduce((a,v)=>a+openRems(v).length,0);
  $("#c-v").textContent=venditori.length;
  $("#c-p").textContent=nOpen; $("#c-p").classList.toggle("zero",!nOpen);
  $("#tab-v").setAttribute("aria-pressed",view==="venditori"&&!selId);
  $("#tab-p").setAttribute("aria-pressed",view==="promemoria");
  $("#tab-pc").setAttribute("aria-pressed",view==="piani");
  $("#tab-a").setAttribute("aria-pressed",view==="accessi");
  $("#tab-az").setAttribute("aria-pressed",view==="azienda");
  $("#btn-new").disabled=!db;
  renderList(); renderPane();
}

function renderList(){
  const s=q.trim().toLowerCase();
  const list=venditori.filter(v=>!s||[v.nome,v.cognome,v.zona,v.telefono,v.email,v.tipo,v.gestitoDa,v.pianoNome,v.note,v.cf].join(" ").toLowerCase().includes(s))
    .sort((a,b)=>full(a).localeCompare(full(b),"it"));
  const box=$("#items");
  if(!ready){box.innerHTML='<p class="none" style="padding:10px">Caricamento…</p>';return}
  if(!list.length){box.innerHTML='<p class="none" style="padding:10px">'+(venditori.length?"Nessun venditore trovato.":"Ancora nessun venditore.")+'</p>';return}
  box.innerHTML=list.map(v=>{
    const due=dueRems(v).length, open=openRems(v).length;
    const badge=due?`<span class="dot due" title="Promemoria scaduti o di oggi">${due}</span>`:open?`<span class="dot open" title="Promemoria aperti">${open}</span>`:"";
    return `<button class="item" data-action="sel" data-id="${v.id}" aria-current="${view==="venditori"&&v.id===selId}">
      <span class="av">${esc(ini(v))}</span>
      <span class="who"><b>${esc(full(v))}</b><span>${esc([v.zona,v.tipo].filter(Boolean).join(" · ")||"Zona non indicata")}</span></span>${badge}</button>`}).join("");
}

function fact(label,val,copy){
  return `<div><dt>${label}</dt><dd class="${val?"":"empty"}">${val?esc(val):"—"}${val&&copy?`<button class="copy" data-action="copy" data-val="${esc(val)}">Copia</button>`:""}</dd></div>`;
}

function fileList(v,cat,noUpload){
  const rows=filesOf(v,cat.k).map(f=>{
    const key="f:"+cat.k+":"+f.id;
    return `<div class="file"><span class="ic">PDF</span>
      <div class="fn"><a href="#" data-action="openfile" data-fid="${esc(f.id)}">${esc(f.nome)}</a><small>${fmtSize(f.size||0)} · ${fmtD(f.data)}</small></div>
      <div class="fa">${downloads?`<button class="btn sm" data-action="dl" data-cat="${cat.k}" data-fid="${f.id}">Scarica</button>`:""}
      ${assets?`<button class="btn sm danger ${armed===key?"armed":""}" data-action="delfile" data-cat="${cat.k}" data-fid="${f.id}">${armed===key?"Conferma":"Elimina"}</button>`:""}</div></div>`}).join("");
  return `<div class="files">${rows||'<p class="none">Nessun PDF caricato.</p>'}</div>
    ${assets&&!noUpload?`<label class="drop" data-drop="${cat.k}"><input type="file" accept="application/pdf,.pdf" multiple hidden data-upload="${cat.k}" id="up-${cat.k}">+ Carica PDF <span style="font-weight:400">o trascinalo qui</span></label>`:""}`;
}

function remRow(v,r,showWho){
  const t=today(); const cls=r.scadenza&&!r.fatto?(r.scadenza<t?"late":r.scadenza===t?"today":""):"";
  const whenTxt=r.scadenza?(cls==="late"?"Scaduto il ":cls==="today"?"Oggi · ":"Entro il ")+fmtD(r.scadenza):"";
  return `<div class="rem ${r.fatto?"done":""}">
    <input type="checkbox" ${r.fatto?"checked":""} data-action="toggle" data-vid="${v.id}" data-rid="${r.id}" aria-label="Segna come fatto">
    <div class="rt">${esc(r.testo)}
      <div class="meta"><span class="tag t-${r.tipo}">${TIPI[r.tipo]||"Da fare"}</span>${whenTxt?`<span class="when ${cls}">${whenTxt}</span>`:""}
      ${showWho?`<button class="who-link" data-action="sel" data-id="${v.id}">${esc(full(v))}</button>`:""}</div></div>
    <button class="x" data-action="delrem" data-vid="${v.id}" data-rid="${r.id}" aria-label="Elimina promemoria">×</button></div>`;
}

function allOpen(){
  const all=[];venditori.forEach(v=>openRems(v).forEach(r=>all.push({v,r})));
  return all.sort((a,b)=>(a.r.scadenza||"9999").localeCompare(b.r.scadenza||"9999"));
}

function renderPane(){
  const pane=$("#pane"), main=$("#main");
  if(noDb){
    main.classList.add("detail");
    pane.innerHTML=`<div class="empty-state"><img src="${ICON}" alt=""><h1>Archivio non raggiungibile</h1><p>Il database ha rifiutato l\'accesso. Controlla che il tuo account sia nelle regole di Firestore (vedi il README del repository).</p></div>`;return}
  if(view==="promemoria"){main.classList.add("detail");return renderAgenda(pane)}
  if(view==="piani"){main.classList.add("detail");return renderPiani(pane)}
  if(view==="accessi"){main.classList.add("detail");return renderAccessi(pane)}
  if(view==="azienda"){main.classList.add("detail");return renderAzienda(pane)}
  const v=cur();
  main.classList.toggle("detail",!!v);
  if(!v)return renderHome(pane);
  const rems=(v.promemoria||[]).slice().sort((a,b)=>(a.fatto-b.fatto)||((a.scadenza||"9999")>(b.scadenza||"9999")?1:-1));
  const delKey="v:"+v.id;
  pane.innerHTML=`<div class="wrap">
    <button class="btn sm back" data-action="back">← Elenco</button>
    <div class="hero">
      <div class="hero-top"><span class="big">${esc(ini(v))}</span>
        <div class="grow"><div class="eyebrow">Venditore${v.zona?" · "+esc(v.zona):""}</div><h1>${esc(full(v))}</h1>
          <div class="sub">${v.pianoNome?`<span class="pill">★ ${esc(v.pianoNome)}</span>`:""}${v.tipo?`<span class="pill">${esc(v.tipo)}</span>`:""}${v.dataInizio?`<span class="pill">Collabora ${since(v.dataInizio)}</span>`:""}</div></div>
        <div class="actions"><button class="btn glass" data-action="edit">Modifica</button>
          <button class="btn glass ${armed===delKey?"armed":""}" data-action="delv">${armed===delKey?"Conferma eliminazione":"Elimina"}</button></div></div>
      <div class="docs-row">${CATS.slice(0,3).map(c=>{const n=c.k==="piano"?pianoOk(v):filesOf(v,c.k).length;return `<span class="pill ${n?"":"miss"}">${n?"✓":"✕"} ${c.s}</span>`}).join("")}
        <span class="pill">${filesOf(v,"fatture").length} fatture</span>${openRems(v).length?`<span class="pill">${openRems(v).length} promemoria</span>`:""}</div>
    </div>

    <div class="sec"><h2>Anagrafica</h2><dl class="facts">
      ${fact("Telefono",v.telefono,true)}${fact("Email",v.email,true)}
      ${fact("Zona di operatività",v.zona)}${fact("Tipo di operatività",v.tipo)}
      ${fact("Gestito da",v.gestitoDa)}${fact("Inizio collaborazione",fmtD(v.dataInizio))}
      ${fact("Piano compensi",v.pianoNome)}${fact("Codice fiscale",v.cf,true)}${fact("IBAN",fmtIban(v.iban),true)}
    </dl></div>

    <div class="sec"><h2>Promemoria <span class="sp when">${openRems(v).length} da fare</span></h2>
      ${rems.length?rems.map(r=>remRow(v,r,false)).join(""):'<p class="none">Nessun promemoria. Aggiungi cosa devi dire, mandare o fare con '+esc(v.nome||"questo venditore")+'.</p>'}
      <form class="remform" data-form="rem">
        <input class="in" id="rem-text" name="testo" placeholder="Es. mandare il nuovo listino Edison" required maxlength="300">
        <select class="in" id="rem-tipo" name="tipo" aria-label="Tipo"><option value="fare">Da fare</option><option value="dire">Da dire</option><option value="mandare">Da mandare</option></select>
        <input class="in" id="rem-date" type="date" name="scadenza" aria-label="Scadenza">
        <button class="btn primary">Aggiungi</button>
      </form></div>

    <div class="grid2">
      ${CATS.map(c=>`<div class="sec"><h2>${c.t}${c.k==="piano"&&v.pianoNome?`<span class="sp" style="color:var(--accent)">${esc(v.pianoNome)}</span>`:`<span class="sp">${filesOf(v,c.k).length||""}</span>`}</h2>${c.k==="piano"?pianoSection(v,c):fileList(v,c)}</div>`).join("")}
      <div class="sec"><h2>Note</h2>${v.note?`<div class="notes">${esc(v.note)}</div>`:'<p class="none">Nessuna nota.</p>'}
        <button class="btn sm" style="margin-top:10px" data-action="edit" data-focus="f-note">Modifica note</button></div>
    </div>
  </div>`;
}

function renderHome(pane){
  if(!ready){pane.innerHTML='<div class="empty-state"><p>Caricamento…</p></div>';return}
  if(!venditori.length){
    pane.innerHTML=`<div class="empty-state"><img src="${ICON}" alt=""><h1>La tua rete vendita, in un posto solo</h1>
      <p>Anagrafica, piano compensi, documenti, contratto, fatture e promemoria di ogni venditore. Inizia aggiungendo il primo.</p>
      <div class="actions" style="justify-content:center"><button class="btn primary" data-action="new">+ Aggiungi il primo venditore</button><button class="btn" data-action="import">Importa un backup</button></div></div>`;return}
  const t=today(), all=allOpen();
  const late=all.filter(x=>x.r.scadenza&&x.r.scadenza<t).length, tod=all.filter(x=>x.r.scadenza===t).length;
  const incompl=venditori.filter(v=>missing(v).length);
  const h=new Date().getHours(), saluto=h<13?"Buongiorno":h<18?"Buon pomeriggio":"Buonasera";
  pane.innerHTML=`<div class="wrap">
    <div class="welcome"><span class="eyebrow">${new Date().toLocaleDateString("it-IT",{weekday:"long",day:"numeric",month:"long"})}</span><h1>${saluto}, ecco la tua rete</h1></div>
    <div class="stats">
      <div class="stat lead"><div class="n">${venditori.length}</div><div class="l">Venditori</div></div>
      <div class="stat ${late?"bad":""}"><div class="n">${late}</div><div class="l">Promemoria scaduti</div></div>
      <div class="stat ${tod?"warn":""}"><div class="n">${tod}</div><div class="l">In scadenza oggi</div></div>
      <div class="stat ${incompl.length?"bad":""}"><div class="n">${incompl.length}</div><div class="l">Schede incomplete</div></div>
    </div>
    <div class="grid2">
      <div class="sec"><h2>Da fare per primi <span class="sp"><button class="who-link" data-action="view" data-v="promemoria">Vedi tutti</button></span></h2>
        ${all.length?all.slice(0,6).map(x=>remRow(x.v,x.r,true)).join(""):'<p class="none">Nessun promemoria aperto.</p>'}</div>
      <div class="sec"><h2>Schede da completare</h2>
        ${incompl.length?incompl.slice(0,8).map(v=>`<button class="todo-v" data-action="sel" data-id="${v.id}"><span class="av">${esc(ini(v))}</span>
          <span class="who"><b>${esc(full(v))}</b><span class="miss-chips">${missing(v).map(c=>`<span class="miss-chip">manca ${c.s.toLowerCase()}</span>`).join("")}</span></span></button>`).join("")
          :'<p class="none">Tutte le schede hanno piano, documento d\'identità e contratto.</p>'}</div>
    </div>
  </div>`;
}

function renderAgenda(pane){
  const t=today(), all=allOpen();
  const groups=[
    ["Scaduti","late",all.filter(x=>x.r.scadenza&&x.r.scadenza<t)],
    ["Oggi","today",all.filter(x=>x.r.scadenza===t)],
    ["Prossimi","",all.filter(x=>x.r.scadenza>t)],
    ["Senza scadenza","",all.filter(x=>!x.r.scadenza)]
  ].filter(g=>g[2].length);
  pane.innerHTML=`<div class="wrap"><button class="btn sm back" data-action="home">← Elenco</button>
    <div class="welcome"><span class="eyebrow">Agenda</span><h1>Promemoria aperti</h1></div>
    ${groups.length?groups.map(([t,c,l])=>`<div class="sec"><h2><span class="when ${c}" style="font-size:inherit">${t}</span><span class="sp">${l.length}</span></h2>${l.map(x=>remRow(x.v,x.r,true)).join("")}</div>`).join("")
      :`<div class="sec"><p class="none">Nessun promemoria aperto. Li aggiungi dalla scheda di ogni venditore.</p></div>`}</div>`;
}

// ---------- FORM ----------
function openForm(v,focusId){
  const isNew=!v; v=v||{};
  const opts=k=>[...new Set(venditori.map(x=>x[k]).filter(Boolean))].map(x=>`<option value="${esc(x)}">`).join("");
  $("#modal-root").innerHTML=`<div class="overlay" data-action="closebg"><form class="modal" data-form="vend" role="dialog" aria-modal="true" aria-labelledby="mt">
    <div class="mhead"><h2 id="mt">${isNew?"Nuovo venditore":"Modifica "+esc(full(v))}</h2><p>${isNew?"Dopo il salvataggio carichi piano, documenti, contratto e fatture in PDF.":"Aggiorna i dati della scheda."}</p></div>
    <div class="mbody"><div class="fgrid">
      <label>Nome<input class="in" id="f-nome" name="nome" value="${esc(v.nome)}" required></label>
      <label>Cognome<input class="in" id="f-cognome" name="cognome" value="${esc(v.cognome)}"></label>
      <label>Telefono<input class="in" id="f-tel" name="telefono" type="tel" value="${esc(v.telefono)}"></label>
      <label>Email<input class="in" id="f-email" name="email" type="email" value="${esc(v.email)}"></label>
      <label>Zona di operatività<input class="in" id="f-zona" name="zona" list="dl-zona" value="${esc(v.zona)}" placeholder="Es. Varese e provincia"></label>
      <label>Tipo di operatività<input class="in" id="f-tipo" name="tipo" list="dl-tipo" value="${esc(v.tipo)}" placeholder="Es. Porta a porta, Agenzia"></label>
      <label>Piano compensi<select class="in" id="f-piano" name="pianoNome"><option value="">—</option>${[...new Set([...pianoNames(),...(v.pianoNome?[v.pianoNome]:[])])].map(p=>`<option ${v.pianoNome===p?"selected":""}>${esc(p)}</option>`).join("")}</select></label>
      <label>Gestito da<input class="in" id="f-gest" name="gestitoDa" list="dl-gest" value="${esc(v.gestitoDa)}"></label>
      <label>Data d'inizio collaborazione<input class="in" id="f-data" name="dataInizio" type="date" value="${esc(v.dataInizio)}"></label>
      <label>Codice fiscale<input class="in" id="f-cf" name="cf" value="${esc(v.cf)}" maxlength="16" placeholder="RSSMRA80A01F205X" autocomplete="off" spellcheck="false" style="text-transform:uppercase"></label>
      <label class="full">IBAN<input class="in" id="f-iban" name="iban" value="${esc(fmtIban(v.iban))}" placeholder="IT00 X000 0000 0000 0000 0000 000" autocomplete="off" spellcheck="false"></label>
      <label class="full">Note<textarea class="in" id="f-note" name="note">${esc(v.note)}</textarea></label>
    </div>
    <datalist id="dl-zona">${opts("zona")}</datalist><datalist id="dl-tipo">${opts("tipo")}</datalist><datalist id="dl-gest">${opts("gestitoDa")}</datalist>
    <div class="err" id="f-err" hidden></div>
    <div class="mfoot"><button type="button" class="btn" data-action="close">Annulla</button><button class="btn primary" id="f-save">${isNew?"Crea venditore":"Salva"}</button></div></div>
  </form></div>`;
  $("#modal-root").dataset.id=isNew?"":v.id;
  setTimeout(()=>{const el=document.getElementById(focusId||"f-nome");el&&el.focus()},30);
}
function closeForm(){$("#modal-root").innerHTML=""}

// ---------- PIANI COMPENSI ----------
function pianoSection(v,c){
  if(!v.pianoNome)return `<p class="none">Nessun piano scelto.</p><button class="btn sm" style="margin-top:10px" data-action="edit" data-focus="f-piano">Scegli il piano</button>`;
  if(isPers(v))return `<p class="pnote">Piano personalizzato: carica qui il PDF del piano di ${esc(v.nome||"questo venditore")}.</p>${fileList(v,c)}`;
  const own=filesOf(v,"piano").length;
  return `<p class="pnote">Piano standard: il PDF è unico per tutti ed è nella sezione <button class="linkbtn" data-action="view" data-v="piani">Piani compensi</button>. Qui non serve allegare niente.</p>${pianoModel(v)}${own?fileList(v,c,true):""}`;
}
function pianoModel(v){
  const p=piani.find(x=>x.nome===v.pianoNome); if(!p||!(p.files||[]).length)return"";
  return `<div class="pmodel">Modello del ${esc(p.nome)}: ${p.files.map(f=>`<a href="#" data-action="openfile" data-fid="${esc(f.id)}">${esc(f.nome)}</a>`).join(", ")}</div>`;
}
function renderPiani(pane){
  const ord=n=>{const i=PIANI.indexOf(n);return i<0?99:i};
  const list=piani.slice().sort((a,b)=>ord(a.nome)-ord(b.nome)||(a.nome||"").localeCompare(b.nome||"","it"));
  pane.innerHTML=`<div class="wrap"><button class="btn sm back" data-action="home">← Elenco</button>
    <div class="page-head"><div class="welcome"><span class="eyebrow">Modelli pronti</span><h1>Piani compensi</h1></div>
      <button class="btn primary" data-action="newpiano">+ Nuovo piano</button></div>
    ${list.length?`<div class="cards">${list.map(p=>{
      const users=venditori.filter(v=>v.pianoNome===p.nome).sort((a,b)=>full(a).localeCompare(full(b),"it"));
      const fs=p.files||[], dk="p:"+p.id, m=medal(p.nome||"");
      const pers=/personalizzat/i.test(p.nome||"");
      return `<article class="pcard"><h3><span class="medal"${m?` style="background:${m}"`:""}></span>${esc(p.nome)}</h3>
        ${p.descrizione?`<div class="desc">${esc(p.descrizione)}</div>`:""}
        ${pers&&!fs.length?"":`<div class="files">${fs.map(f=>{const k="pf:"+p.id+":"+f.id;return `<div class="file"><span class="ic">PDF</span>
          <div class="fn"><a href="#" data-action="openfile" data-fid="${esc(f.id)}">${esc(f.nome)}</a><small>${fmtSize(f.size||0)} · ${fmtD(f.data)}</small></div>
          <div class="fa">${downloads?`<button class="btn sm" data-action="pdl" data-pid="${p.id}" data-fid="${f.id}">Scarica</button>`:""}
          ${assets?`<button class="btn sm danger ${armed===k?"armed":""}" data-action="pdelfile" data-pid="${p.id}" data-fid="${f.id}">${armed===k?"Conferma":"Elimina"}</button>`:""}</div></div>`}).join("")||'<p class="none">Nessun PDF caricato.</p>'}</div>`}
        ${pers?`<p class="pnote">Ogni venditore con questo piano ha il suo PDF, caricato nella propria scheda.</p>`:""}
        ${assets&&!(pers&&!fs.length)?`<label class="drop" data-pdrop="${p.id}"><input type="file" accept="application/pdf,.pdf" multiple hidden data-pupload="${p.id}" id="pup-${p.id}">+ Carica PDF <span style="font-weight:400">o trascinalo qui</span></label>`:""}
        <div class="meta">${users.length?`Usato da ${users.length} ${users.length===1?"venditore":"venditori"}`:"Nessun venditore con questo piano"}</div>
        ${users.length?`<div class="users">${users.map(v=>`<button class="uchip" data-action="sel" data-id="${v.id}">${esc(full(v))}</button>`).join("")}</div>`:""}
        <div class="foot"><button class="btn sm" data-action="editpiano" data-pid="${p.id}">Modifica</button>
          <button class="btn sm danger ${armed===dk?"armed":""}" data-action="delpiano" data-pid="${p.id}">${armed===dk?"Conferma eliminazione":"Elimina"}</button></div>
      </article>`}).join("")}</div>`
    :`<div class="sec"><p class="none">Nessun piano salvato. Crea il primo con "Nuovo piano" e carica il suo PDF.</p></div>`}
  </div>`;
}
function showModal(form,title,sub,body,id,saveLbl,focusId){
  $("#modal-root").innerHTML=`<div class="overlay" data-action="closebg"><form class="modal" data-form="${form}" role="dialog" aria-modal="true" aria-labelledby="mt">
    <div class="mhead"><h2 id="mt">${title}</h2>${sub?`<p>${sub}</p>`:""}</div>
    <div class="mbody"><div class="fgrid">${body}</div><div class="err" id="f-err" hidden></div>
    <div class="mfoot"><button type="button" class="btn" data-action="close">Annulla</button><button class="btn primary" id="f-save">${saveLbl}</button></div></div></form></div>`;
  $("#modal-root").dataset.id=id||"";
  setTimeout(()=>{const el=document.getElementById(focusId);el&&el.focus()},30);
}
function openPianoForm(p){
  const isNew=!p; p=p||{};
  showModal("piano",isNew?"Nuovo piano compensi":"Modifica "+esc(p.nome),isNew?"Dopo il salvataggio carichi il PDF del piano.":"Se cambi il nome, lo aggiorno anche sui venditori che lo usano.",
    `<label class="full">Nome del piano<input class="in" id="f-pnome" name="nome" value="${esc(p.nome)}" required placeholder="Es. Piano Oro 2027"></label>
     <label class="full">Descrizione<textarea class="in" id="f-pdesc" name="descrizione" placeholder="A chi è destinato, gettoni, condizioni particolari…">${esc(p.descrizione)}</textarea></label>`,
    p.id,isNew?"Crea piano":"Salva","f-pnome");
}
async function savePiano(form){
  const d=Object.fromEntries(new FormData(form).entries()); Object.keys(d).forEach(k=>d[k]=String(d[k]).trim());
  if(!d.nome){ferr("Inserisci il nome del piano.");return}
  const id=$("#modal-root").dataset.id;
  if(piani.some(p=>p.id!==id&&(p.nome||"").toLowerCase()===d.nome.toLowerCase())){ferr("Esiste già un piano con questo nome.");return}
  $("#f-save").disabled=true;
  try{
    if(id){
      const old=piani.find(p=>p.id===id);
      await write("p-"+id,()=>db.collection("piani").doc(id).update({...d,aggiornato:nowIso()}));
      if(old&&old.nome!==d.nome){for(const v of venditori.filter(v=>v.pianoNome===old.nome))await write(v.id,()=>db.collection("venditori").doc(v.id).update({pianoNome:d.nome}))}
      toast("Piano aggiornato");
    }else{await db.collection("piani").doc().set({...d,files:[],creato:nowIso(),aggiornato:nowIso()});toast("Piano creato")}
    closeForm();
  }catch(e){console.error(e);ferr("Salvataggio non riuscito. Riprova.");$("#f-save").disabled=false}
}
async function uploadPiano(pid,fileList){
  if(!assets)return;
  const list=[...fileList], ok=list.filter(f=>f.type==="application/pdf"||/\.pdf$/i.test(f.name));
  if(ok.length<list.length)toast("Solo file PDF");
  if(!ok.length)return;
  toast("Caricamento in corso…");
  const added=[];
  for(const f of ok){
    try{const r=await assets.upload(f,{type:"application/pdf"});added.push({id:r.id,nome:f.name,size:r.sizeBytes,data:nowIso()})}
    catch(e){toast(e?.code==="too_large"?f.name+" supera 20 MB":"Caricamento di "+f.name+" non riuscito");console.error(e)}
  }
  if(!added.length)return;
  await write("p-"+pid,async()=>{const fresh=piani.find(x=>x.id===pid);await db.collection("piani").doc(pid).update({files:[...((fresh&&fresh.files)||[]),...added],aggiornato:nowIso()})});
  toast(added.length===1?"PDF caricato":added.length+" PDF caricati");
}
async function delPianoFile(pid,fid){
  await write("p-"+pid,async()=>{const fresh=piani.find(x=>x.id===pid);
    await db.collection("piani").doc(pid).update({files:((fresh&&fresh.files)||[]).filter(f=>f.id!==fid)});
    try{await assets.delete(fid)}catch(e){console.error(e)}});
  toast("File eliminato");
}
async function delPiano(pid){
  const p=piani.find(x=>x.id===pid); if(!p)return;
  await write("p-"+pid,()=>db.collection("piani").doc(pid).delete());
  for(const f of p.files||[]){try{await assets?.delete(f.id)}catch(e){}}
  toast("Piano eliminato");
}
async function dlFile(f){
  if(!downloads)return;
  try{await downloads.save({filename:/\.pdf$/i.test(f.nome)?f.nome:f.nome+".pdf",data:await getFile(f.id)});
  }catch(e){if(e?.code!=="declined")toast(e?.code==="missing"?"File non trovato":"Download non disponibile qui")}
}


// ---------- AZIENDA ----------
const AZ_FIELDS=[
  ["ragioneSociale","Ragione sociale"],["forma","Forma giuridica"],["sede","Sede legale"],["pec","PEC"],
  ["piva","Partita IVA"],["cf","Codice fiscale"],["sdi","Codice univoco (SDI)"],["rea","Numero REA"],["amministratore","Amministratore unico"],
  ["costituzione","Data di costituzione"],["iscrizione","Iscrizione al Registro Imprese"],["inizioAttivita","Inizio attività"],
  ["capitale","Capitale sociale"],["ateco","Codice ATECO"],["attivita","Attività prevalente"]];
const AZ_COPY=["pec","piva","cf","rea","sdi"];
// Dati pubblici del Registro Imprese (visura del 05/10/2026), proposti la prima volta.
const AZ_VISURA={ragioneSociale:"TOP HOUSE SRLS",forma:"Società a responsabilità limitata semplificata",
  sede:"Viale Lombardia 30, 21052 Busto Arsizio (VA)",pec:"tophouse@mypec.eu",piva:"04154940128",cf:"04154940128",sdi:"K0ROACV",
  rea:"VA - 405781",amministratore:"Gabriele Straniero",costituzione:"24/06/2026",iscrizione:"02/07/2026",
  inizioAttivita:"31/07/2026",capitale:"1.000,00 €",ateco:"70.20.09",
  attivita:"Servizi di consulenza tecnico-economica nel settore aziendale, pianificazione strategica e organizzativa"};
function renderAzienda(pane){
  const a=azienda||{}, fs=a.files||[];
  pane.innerHTML=`<div class="wrap"><button class="btn sm back" data-action="home">← Elenco</button>
    <div class="page-head"><div class="welcome"><span class="eyebrow">Società</span><h1>${esc(a.ragioneSociale||"Top House")}</h1></div>
      <button class="btn" data-action="editaz">Modifica dati</button></div>
    <div class="sec"><h2>Dati aziendali${a.aggiornato?`<span class="sp">aggiornati il ${fmtD(a.aggiornato)}</span>`:""}</h2>
      ${AZ_FIELDS.some(([k])=>a[k])?`<dl class="facts">${AZ_FIELDS.map(([k,l])=>fact(l,a[k],AZ_COPY.includes(k))).join("")}</dl>`
        :'<p class="pnote">Ho preparato i dati dalla visura camerale del 05/10/2026: controllali e salvali.</p><button class="btn primary" data-action="editaz">Controlla e salva i dati</button>'}
      ${a.note?`<div class="notes" style="margin-top:14px">${esc(a.note)}</div>`:""}</div>
    <div class="sec"><h2>Documenti aziendali<span class="sp">${fs.length||""}</span></h2>
      <p class="pnote">Visura camerale, statuto, atto costitutivo, certificati, DURC e altri documenti di Top House.</p>
      <div class="files">${fs.map(f=>{const k="az:"+f.id;return `<div class="file"><span class="ic">PDF</span>
        <div class="fn"><a href="#" data-action="openfile" data-fid="${esc(f.id)}">${esc(f.nome)}</a><small>${fmtSize(f.size||0)} · ${fmtD(f.data)}</small></div>
        <div class="fa">${downloads?`<button class="btn sm" data-action="azdl" data-fid="${f.id}">Scarica</button>`:""}
        ${assets?`<button class="btn sm danger ${armed===k?"armed":""}" data-action="azdel" data-fid="${f.id}">${armed===k?"Conferma":"Elimina"}</button>`:""}</div></div>`}).join("")||'<p class="none">Nessun documento caricato.</p>'}</div>
      ${assets?`<label class="drop" data-azdrop="1"><input type="file" accept="application/pdf,.pdf" multiple hidden data-azupload="1" id="az-up">+ Carica PDF <span style="font-weight:400">o trascinalo qui</span></label>`:""}
    </div></div>`;
}
function openAzForm(){
  const a=azienda&&AZ_FIELDS.some(([k])=>azienda[k])?azienda:{...AZ_VISURA,...(azienda||{})};
  showModal("az","Dati aziendali","I dati di Top House come risultano dalla visura camerale.",
    AZ_FIELDS.map(([k,l])=>`<label class="${k==="attivita"||k==="sede"?"full":""}">${l}<input class="in" id="az-${k}" name="${k}" value="${esc(a[k])}"></label>`).join("")+
    `<label class="full">Note<textarea class="in" id="az-note" name="note">${esc(a.note)}</textarea></label>`,
    AZ_ID,"Salva","az-ragioneSociale");
}
async function saveAz(form){
  const d=Object.fromEntries(new FormData(form).entries()); Object.keys(d).forEach(k=>d[k]=String(d[k]).trim());
  $("#f-save").disabled=true;
  try{
    const ref=db.collection("azienda").doc(AZ_ID);
    await write("az",()=>azienda?ref.update({...d,aggiornato:nowIso()}):ref.set({...d,files:[],aggiornato:nowIso()}));
    closeForm(); toast("Dati aziendali salvati");
  }catch(e){console.error(e);ferr("Salvataggio non riuscito. Riprova.");$("#f-save").disabled=false}
}
async function uploadAz(fileList){
  if(!assets)return;
  const list=[...fileList], ok=list.filter(f=>f.type==="application/pdf"||/\.pdf$/i.test(f.name));
  if(ok.length<list.length)toast("Solo file PDF");
  if(!ok.length)return;
  toast("Caricamento in corso…");
  const added=[];
  for(const f of ok){
    try{const r=await assets.upload(f,{type:"application/pdf"});added.push({id:r.id,nome:f.name,size:r.sizeBytes,data:nowIso()})}
    catch(e){toast(e?.code==="too_large"?f.name+" supera 20 MB":"Caricamento di "+f.name+" non riuscito");console.error(e)}
  }
  if(!added.length)return;
  const ref=db.collection("azienda").doc(AZ_ID);
  await write("az",()=>azienda?ref.update({files:[...(azienda.files||[]),...added],aggiornato:nowIso()}):ref.set({files:added,aggiornato:nowIso()}));
  toast(added.length===1?"PDF caricato":added.length+" PDF caricati");
}
async function delAzFile(fid){
  await write("az",async()=>{await db.collection("azienda").doc(AZ_ID).update({files:((azienda&&azienda.files)||[]).filter(f=>f.id!==fid)});
    try{await assets.delete(fid)}catch(e){console.error(e)}});
  toast("File eliminato");
}

// ---------- ACCESSI ----------
function accRow(a){
  const show=revealed.has(a.id), dk="a:"+a.id, url=normUrl(a.link);
  return `<div class="acc"><div class="an">${esc(a.nome)}${url?`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(url.replace(/^https?:\/\//i,"").replace(/\/$/,""))} ↗</a>`:""}</div>
    <div class="fa"><button class="btn sm" data-action="editacc" data-aid="${a.id}">Modifica</button>
      <button class="btn sm danger ${armed===dk?"armed":""}" data-action="delacc" data-aid="${a.id}">${armed===dk?"Conferma":"Elimina"}</button></div>
    ${a.utente||a.password?`<div class="cred">
      ${a.utente?`<span><span class="k">Utente</span><span class="mono">${esc(a.utente)}</span><button class="copy" data-action="copy" data-val="${esc(a.utente)}">Copia</button></span>`:""}
      ${a.password?`<span><span class="k">Password</span><span class="mono">${show?esc(a.password):"••••••••"}</span><button class="copy" data-action="togglepw" data-aid="${a.id}">${show?"Nascondi":"Mostra"}</button><button class="copy" data-action="copypw" data-aid="${a.id}">Copia</button></span>`:""}
    </div>`:""}
    ${a.note?`<div class="anote">${esc(a.note)}</div>`:""}
  </div>`;
}
function renderAccessi(pane){
  const ae=document.activeElement, had=ae&&ae.id==="qa", pos=had?ae.selectionStart:0;
  const s=qa.trim().toLowerCase();
  const list=accessi.filter(a=>!s||[a.nome,a.categoria,a.link,a.utente,a.note].join(" ").toLowerCase().includes(s)).sort((a,b)=>(a.nome||"").localeCompare(b.nome||"","it"));
  const groups={}; list.forEach(a=>{const c=a.categoria||"Altro";(groups[c]=groups[c]||[]).push(a)});
  const ix=x=>{const k=ACC_CATS.indexOf(x);return k<0?50:k};
  const order=Object.keys(groups).sort((a,b)=>ix(a)-ix(b)||a.localeCompare(b,"it"));
  pane.innerHTML=`<div class="wrap"><button class="btn sm back" data-action="home">← Elenco</button>
    <div class="page-head"><div class="welcome"><span class="eyebrow">Credenziali</span><h1>Accessi</h1></div>
      <button class="btn primary" data-action="newacc">+ Nuovo accesso</button></div>
    <p class="lock">Le vedi solo tu e chi ha accesso come Editor a questa pagina. Le password restano nascoste finché non premi Mostra.</p>
    <input class="search" id="qa" type="search" placeholder="Cerca servizio, utente, link…" value="${esc(qa)}" aria-label="Cerca accesso">
    ${order.length?order.map(c=>`<div class="sec"><h2>${esc(c)}<span class="sp">${groups[c].length}</span></h2>${groups[c].map(accRow).join("")}</div>`).join("")
      :`<div class="sec"><p class="none">${accessi.length?"Nessun accesso trovato.":"Nessun accesso salvato. Aggiungi i portali dei gestori, il CRM, le email aziendali: nome, link, utente e password."}</p></div>`}
  </div>`;
  if(had){const n=$("#qa");n.focus();try{n.setSelectionRange(pos,pos)}catch(e){}}
}
function openAccForm(a){
  const isNew=!a; a=a||{};
  const cats=[...new Set([...ACC_CATS,...accessi.map(x=>x.categoria).filter(Boolean)])];
  showModal("acc",isNew?"Nuovo accesso":"Modifica "+esc(a.nome),"Link, utente e password di un portale o servizio.",
    `<label>Servizio<input class="in" id="f-anome" name="nome" value="${esc(a.nome)}" required placeholder="Es. Portale Edison"></label>
     <label>Categoria<input class="in" id="f-acat" name="categoria" list="dl-acat" value="${esc(a.categoria)}" placeholder="Gestori luce e gas"></label>
     <label class="full">Link di accesso<input class="in" id="f-alink" name="link" inputmode="url" value="${esc(a.link)}" placeholder="https://…" autocomplete="off" spellcheck="false"></label>
     <label>Utente o email<input class="in" id="f-auser" name="utente" value="${esc(a.utente)}" autocomplete="off" spellcheck="false"></label>
     <label>Password<span class="pwrow"><input class="in" id="f-apw" name="password" type="password" value="${esc(a.password)}" autocomplete="new-password" spellcheck="false"><button type="button" class="btn sm" data-action="formpw">Mostra</button></span></label>
     <label class="full">Note<textarea class="in" id="f-anote" name="note" placeholder="Codice agenzia, PIN, a chi chiedere il reset…">${esc(a.note)}</textarea></label>
     <datalist id="dl-acat">${cats.map(c=>`<option value="${esc(c)}">`).join("")}</datalist>`,
    a.id,isNew?"Salva accesso":"Salva","f-anome");
}
async function saveAcc(form){
  const d=Object.fromEntries(new FormData(form).entries()); Object.keys(d).forEach(k=>d[k]=String(d[k]).trim());
  if(!d.nome){ferr("Inserisci il nome del servizio.");return}
  const id=$("#modal-root").dataset.id; $("#f-save").disabled=true;
  try{
    if(id){await write("a-"+id,()=>db.collection("accessi").doc(id).update({...d,aggiornato:nowIso()}));toast("Accesso aggiornato")}
    else{await db.collection("accessi").doc().set({...d,creato:nowIso(),aggiornato:nowIso()});toast("Accesso salvato")}
    closeForm();
  }catch(e){console.error(e);ferr("Salvataggio non riuscito. Riprova.");$("#f-save").disabled=false}
}
async function delAcc(id){await write("a-"+id,()=>db.collection("accessi").doc(id).delete());revealed.delete(id);toast("Accesso eliminato")}

async function saveForm(form){
  const data=Object.fromEntries(new FormData(form).entries());
  Object.keys(data).forEach(k=>data[k]=String(data[k]).trim());
  if(!data.nome){$("#f-err").textContent="Inserisci almeno il nome.";$("#f-err").hidden=false;return}
  data.cf=(data.cf||"").replace(/\s+/g,"").toUpperCase();
  if(data.cf&&data.cf.length===16&&!cfOk(data.cf)){$("#f-err").textContent="Il codice fiscale non è valido: controlla le lettere e i numeri.";$("#f-err").hidden=false;$("#f-cf").focus();return}
  data.iban=(data.iban||"").replace(/\s+/g,"").toUpperCase();
  if(data.iban&&!ibanOk(data.iban)){$("#f-err").textContent="L'IBAN non è valido: controlla di averlo copiato per intero e senza errori.";$("#f-err").hidden=false;$("#f-iban").focus();return}
  const id=$("#modal-root").dataset.id;
  $("#f-save").disabled=true;
  try{
    if(id){await write(id,()=>db.collection("venditori").doc(id).update({...data,aggiornato:new Date().toISOString()}));toast("Modifiche salvate")}
    else{
      const ref=db.collection("venditori").doc();
      await ref.set({...data,creato:new Date().toISOString(),promemoria:[],files:{piano:[],identita:[],contratto:[],fatture:[],altri:[]}});
      selId=ref.id; view="venditori"; toast("Venditore creato");
    }
    closeForm(); render();
  }catch(e){$("#f-err").textContent=e?.code==="quota_exceeded"?"Archivio pieno: elimina qualche venditore e riprova.":"Salvataggio non riuscito. Riprova.";$("#f-err").hidden=false;$("#f-save").disabled=false}
}

// ---------- AZIONI ----------
async function upload(cat,fileList){
  const v=cur(); if(!v||!assets)return;
  const list=[...fileList];
  const bad=list.filter(f=>!(f.type==="application/pdf"||/\.pdf$/i.test(f.name)));
  if(bad.length)toast("Solo PDF: "+bad.map(f=>f.name).join(", ")+" ignorato");
  const ok=list.filter(f=>!bad.includes(f)); if(!ok.length)return;
  toast("Caricamento in corso…");
  const added=[];
  for(const f of ok){
    try{const r=await assets.upload(f,{type:"application/pdf"});added.push({id:r.id,nome:f.name,size:r.sizeBytes,data:new Date().toISOString()})}
    catch(e){toast(e?.code==="too_large"?f.name+" supera 20 MB":e?.code==="quota_or_state"?"Spazio esaurito per i file":"Caricamento di "+f.name+" non riuscito");console.error(e)}
  }
  if(!added.length)return;
  await write(v.id,async()=>{
    const fresh=venditori.find(x=>x.id===v.id)||v;
    await db.collection("venditori").doc(v.id).update({files:{[cat]:[...filesOf(fresh,cat),...added]}});
  });
  toast(added.length===1?"PDF caricato":added.length+" PDF caricati");
}

async function delFile(cat,fid){
  const v=cur(); if(!v)return;
  await write(v.id,async()=>{
    const fresh=venditori.find(x=>x.id===v.id)||v;
    await db.collection("venditori").doc(v.id).update({files:{[cat]:filesOf(fresh,cat).filter(f=>f.id!==fid)}});
    try{await assets.delete(fid)}catch(e){console.error(e)}
  });
  toast("File eliminato");
}

async function delVend(){
  const v=cur(); if(!v)return;
  const ids=Object.values(v.files||{}).flat().map(f=>f.id);
  await write(v.id,()=>db.collection("venditori").doc(v.id).delete());
  for(const id of ids){try{await assets?.delete(id)}catch(e){}}
  selId=null; toast("Venditore eliminato"); render();
}

async function dl(cat,fid){
  const v=cur(); const f=filesOf(v||{},cat).find(x=>x.id===fid); if(!f||!downloads)return;
  try{
    const blob=await getFile(fid);
    await downloads.save({filename:/\.pdf$/i.test(f.nome)?f.nome:f.nome+".pdf",data:blob});
  }catch(e){if(e?.code!=="declined")toast(e?.code==="missing"?"File non trovato":"Download non disponibile qui")}
}

function setRems(vid,fn){
  return write(vid,async()=>{
    const v=venditori.find(x=>x.id===vid); if(!v)return;
    await db.collection("venditori").doc(vid).update({promemoria:fn((v.promemoria||[]).slice())});
  });
}

document.addEventListener("click",e=>{
  const b=e.target.closest("[data-action]");
  const a=b?.dataset.action;
  if(armed&&!["delfile","delv","delpiano","pdelfile","delacc","azdel"].includes(a)){armed=null; if(!a){render();return}}
  if(!e.target.closest("#menu,#acct"))$("#menu").hidden=true;
  if(!b)return;
  if(a==="closebg"&&e.target!==b)return;
  switch(a){
    case "home": view="venditori"; selId=null; render(); break;
    case "view": view=b.dataset.v; render(); break;
    case "sel": selId=b.dataset.id; view="venditori"; render(); $("#pane").scrollTop=0; break;
    case "back": selId=null; render(); break;
    case "new": if(db)openForm(null); break;
    case "edit": openForm(cur(),b.dataset.focus); break;
    case "close": case "closebg": closeForm(); break;
    case "copy": navigator.clipboard?.writeText(b.dataset.val).then(()=>toast("Copiato"),()=>toast("Copia non riuscita: seleziona il testo")); break;
    case "dl": dl(b.dataset.cat,b.dataset.fid); break;
    case "delfile":{const k="f:"+b.dataset.cat+":"+b.dataset.fid; if(armed===k){armed=null;delFile(b.dataset.cat,b.dataset.fid)}else{armed=k;render()}break}
    case "delv":{const k="v:"+selId; if(armed===k){armed=null;delVend()}else{armed=k;render()}break}
    case "openfile": e.preventDefault(); openFile(b.dataset.fid); break;
    case "acct": $("#menu").hidden=!$("#menu").hidden; break;
    case "import": $("#menu").hidden=true; $("#imp").click(); break;
    case "export": $("#menu").hidden=true; exportBackup(); break;
    case "logout": $("#menu").hidden=true; logout(); break;
    case "login": doLogin(b); break;
    case "resetpw": doReset(); break;
    case "delrem": setRems(b.dataset.vid,l=>l.filter(r=>r.id!==b.dataset.rid)); break;
    case "newpiano": if(db)openPianoForm(null); break;
    case "editpiano": openPianoForm(piani.find(p=>p.id===b.dataset.pid)); break;
    case "delpiano":{const k="p:"+b.dataset.pid; if(armed===k){armed=null;delPiano(b.dataset.pid)}else{armed=k;render()}break}
    case "pdelfile":{const k="pf:"+b.dataset.pid+":"+b.dataset.fid; if(armed===k){armed=null;delPianoFile(b.dataset.pid,b.dataset.fid)}else{armed=k;render()}break}
    case "editaz": if(db)openAzForm(); break;
    case "azdel":{const k="az:"+b.dataset.fid; if(armed===k){armed=null;delAzFile(b.dataset.fid)}else{armed=k;render()}break}
    case "azdl":{const f=((azienda&&azienda.files)||[]).find(x=>x.id===b.dataset.fid);if(f)dlFile(f);break}
    case "pdl":{const p=piani.find(x=>x.id===b.dataset.pid);const f=((p&&p.files)||[]).find(x=>x.id===b.dataset.fid);if(f)dlFile(f);break}
    case "newacc": if(db)openAccForm(null); break;
    case "editacc": openAccForm(accessi.find(x=>x.id===b.dataset.aid)); break;
    case "delacc":{const k="a:"+b.dataset.aid; if(armed===k){armed=null;delAcc(b.dataset.aid)}else{armed=k;render()}break}
    case "togglepw":{const id=b.dataset.aid; if(revealed.has(id))revealed.delete(id);else revealed.add(id); renderPane(); break}
    case "copypw":{const x=accessi.find(y=>y.id===b.dataset.aid); if(x&&navigator.clipboard)navigator.clipboard.writeText(x.password).then(()=>toast("Password copiata"),()=>toast("Copia non riuscita: premi Mostra e seleziona il testo")); break}
    case "formpw":{const i=$("#f-apw"); if(i){i.type=i.type==="password"?"text":"password"; b.textContent=i.type==="password"?"Mostra":"Nascondi"} break}
  }
});
document.addEventListener("change",e=>{
  const t=e.target;
  if(t.id==="imp"&&t.files&&t.files[0]){const f=t.files[0];t.value="";importBackup(f)}
  if(t.dataset.upload){const fl=[...t.files];t.value="";upload(t.dataset.upload,fl)}
  if(t.dataset.pupload){const fl=[...t.files];t.value="";uploadPiano(t.dataset.pupload,fl)}
  if(t.dataset.azupload){const fl=[...t.files];t.value="";uploadAz(fl)}
  if(t.dataset.action==="toggle")setRems(t.dataset.vid,l=>l.map(r=>r.id===t.dataset.rid?{...r,fatto:t.checked}:r));
});
["dragover","dragleave","drop"].forEach(ev=>document.addEventListener(ev,e=>{
  const z=e.target.closest&&e.target.closest("[data-drop],[data-pdrop],[data-azdrop]"); if(!z)return;
  e.preventDefault();
  if(ev==="dragover")z.classList.add("over"); else z.classList.remove("over");
  if(ev==="drop"&&e.dataTransfer?.files?.length){if(z.dataset.azdrop)uploadAz(e.dataTransfer.files);else if(z.dataset.pdrop)uploadPiano(z.dataset.pdrop,e.dataTransfer.files);else upload(z.dataset.drop,e.dataTransfer.files)}
}));
document.addEventListener("submit",e=>{
  e.preventDefault(); const f=e.target;
  if(f.dataset.form==="login")doLoginEmail(f);
  if(f.dataset.form==="vend")saveForm(f);
  if(f.dataset.form==="piano")savePiano(f);
  if(f.dataset.form==="acc")saveAcc(f);
  if(f.dataset.form==="az")saveAz(f);
  if(f.dataset.form==="rem"){
    const d=Object.fromEntries(new FormData(f).entries()); const testo=String(d.testo||"").trim(); if(!testo||!selId)return;
    setRems(selId,l=>[...l,{id:uid(),testo,tipo:d.tipo||"fare",scadenza:d.scadenza||"",fatto:false,creato:new Date().toISOString()}]);
    f.reset(); toast("Promemoria aggiunto");
  }
});
document.addEventListener("keydown",e=>{if(e.key==="Escape"){$("#menu").hidden=true;if($("#modal-root").innerHTML&&!$("#modal-root").dataset.busy)closeForm()}});
$("#q").addEventListener("input",e=>{q=e.target.value;renderList()});
document.addEventListener("input",e=>{if(e.target.id==="qa"){qa=e.target.value;renderPane()}});

// ---------- AVVIO ----------
(()=>{const sp=$("#splash");if(!sp)return;
  sp.addEventListener("click",()=>sp.classList.add("skip"));
  sp.addEventListener("animationend",e=>{if(e.target===sp&&e.animationName==="sp-out")sp.remove()});
  setTimeout(()=>sp.isConnected&&sp.remove(),4000);})();
render();
let unsubs=[];
function startData(){
  db=fdb; assets=fassets; downloads=fdownloads; noDb=false; ready=false;
  const fail=err=>{console.error(err);noDb=true;ready=true;render()};
  unsubs.push(db.collection("piani").onSnapshot(s=>{piani=s.docs.map(d=>({id:d.id,...d.data()}));if(ready)render()},fail));
  unsubs.push(db.collection("azienda").onSnapshot(s=>{const d=s.docs.find(x=>x.id===AZ_ID);azienda=d?{id:d.id,...d.data()}:null;
    // Codice univoco comunicato il 28/10/2026: lo aggiungo una volta sola ai dati già salvati che non lo hanno.
    if(azienda&&!azienda.sdi&&!sdiAdded){sdiAdded=true;write("az",()=>db.collection("azienda").doc(AZ_ID).update({sdi:AZ_VISURA.sdi}))}if(ready&&view==="azienda")renderPane()},fail));
  unsubs.push(db.collection("accessi").onSnapshot(s=>{accessi=s.docs.map(d=>({id:d.id,...d.data()}));if(ready&&view==="accessi")renderPane()},fail));
  unsubs.push(db.collection("venditori").onSnapshot(snap=>{
    venditori=snap.docs.map(d=>({id:d.id,...d.data()}));
    if(selId&&!venditori.some(v=>v.id===selId))selId=null;
    ready=true;
    const ae=document.activeElement;
    if(ae&&ae.closest&&ae.closest('form[data-form="rem"]')&&ae.value){renderList();return}
    render();
  },fail));
}
function stopData(){unsubs.forEach(u=>{try{u()}catch(e){}});unsubs=[];venditori=[];piani=[];accessi=[];azienda=null;ready=false;selId=null;db=assets=downloads=null}
function gate(html){const g=$("#gate");if(html===null){g.hidden=true;return}$("#gate-body").innerHTML=html;g.hidden=false}
async function doLogin(b){
  b.disabled=true;
  try{await login()}catch(e){console.error(e);
    const m=e.code==="auth/unauthorized-domain"?"Questo indirizzo non è autorizzato in Firebase: aggiungilo in Authentication → Impostazioni → Domini autorizzati."
      :e.code==="auth/popup-closed-by-user"?"Accesso annullato.":"Accesso non riuscito ("+(e.code||"errore")+"). Riprova.";
    toast(m)}
  b.disabled=false;
}
function loginHtml(email){
  return `<h1 style="font-family:var(--display);font-size:22px;margin:0">Archivio venditori</h1>
  <form class="login-form" data-form="login" autocomplete="on">
    <label for="l-email">Email</label>
    <input class="in" id="l-email" name="email" type="email" autocomplete="username" required value="${esc(email||"")}">
    <label for="l-pw">Password</label>
    <input class="in" id="l-pw" name="password" type="password" autocomplete="current-password" required>
    <button class="btn primary" id="l-go">Accedi</button>
    <button type="button" class="linkbtn" data-action="resetpw">Password dimenticata o da impostare?</button>
  </form>
  <div class="or"><span>oppure</span></div>
  <button class="btn" data-action="login">Accedi con Google</button>`;
}
async function doLoginEmail(f){
  const d=Object.fromEntries(new FormData(f).entries()), b=$("#l-go");
  b.disabled=true;
  try{await loginEmail(d.email,d.password)}
  catch(e){console.error(e);
    const c=e.code||"";
    toast(c==="auth/invalid-credential"||c==="auth/wrong-password"||c==="auth/user-not-found"||c==="auth/invalid-login-credentials"?"Email o password non corretti. Se non hai ancora una password, premi \"Password dimenticata o da impostare?\".":
      c==="auth/too-many-requests"?"Troppi tentativi: aspetta qualche minuto e riprova.":
      c==="auth/operation-not-allowed"?"L'accesso con password non è attivo su Firebase.":"Accesso non riuscito ("+(c||"errore")+"). Riprova.");
    b.disabled=false}
}
async function doReset(){
  const em=($("#l-email")&&$("#l-email").value||"").trim();
  if(!em){toast("Scrivi prima la tua email, poi premi di nuovo.");$("#l-email")&&$("#l-email").focus();return}
  try{await resetPassword(em);toast("Ti ho mandato un'email per impostare la password: controlla anche lo spam.")}
  catch(e){console.error(e);toast(e.code==="auth/invalid-email"?"L'email non è scritta correttamente.":"Invio non riuscito ("+(e.code||"errore")+"). Riprova.")}
}
function setUser(u){
  const a=$("#acct"); a.hidden=false;
  const ini=(u.displayName||u.email||"?").split(/\s+/).map(w=>w[0]).slice(0,2).join("").toUpperCase();
  a.innerHTML=u.photoURL?`<img src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer">`:esc(ini);
  $("#me-name").textContent=u.displayName||"Account"; $("#me-mail").textContent=u.email||"";
}
async function openFile(id){
  const w=window.open("","_blank");
  try{const u=URL.createObjectURL(await getFile(id)); if(w)w.location.href=u; else location.href=u; setTimeout(()=>URL.revokeObjectURL(u),120000)}
  catch(e){console.error(e);if(w)w.close();toast("File non trovato")}
}
function progress(title){
  $("#modal-root").dataset.busy="1";
  $("#modal-root").innerHTML=`<div class="overlay"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="mt"><div class="mhead"><h2 id="mt">${title}</h2><p>Non chiudere la pagina finché non ha finito.</p></div><div class="mbody"><p class="prog" id="prog">Inizio…</p><div class="mfoot" id="prog-foot" hidden><button type="button" class="btn" data-action="close">Chiudi</button></div></div></div></div>`;
  return (msg,err)=>{const p=$("#prog");if(!p)return;p.textContent=msg;if(err){p.style.color="var(--bad)";$("#prog-foot").hidden=false;delete $("#modal-root").dataset.busy}};
}
function endProgress(){delete $("#modal-root").dataset.busy;closeForm()}
async function importBackup(file){
  if(!db)return;
  if(!window.JSZip){toast("Libreria per i file zip non caricata: ricarica la pagina");return}
  const prog=progress("Importo il backup");
  try{
    const zip=await JSZip.loadAsync(file);
    const dataFile=zip.file("data.json"); if(!dataFile)throw new Error("formato");
    const meta=JSON.parse(await dataFile.async("string"));
    if(meta.formato!=="tophouse-backup-1"||!meta.dati)throw new Error("formato");
    const files=Object.values(zip.files).filter(f=>!f.dir&&/^files\/[A-Za-z0-9_-]+\.pdf$/.test(f.name));
    let i=0;
    for(const f of files){prog(`Carico i PDF: ${++i} di ${files.length}`);await fassets.uploadWithId(f.name.slice(6,-4),await f.async("blob"))}
    const items=[];
    for(const c of ["venditori","piani","accessi","azienda"])for(const [id,d] of Object.entries(meta.dati[c]||{}))items.push({path:c,id,data:d});
    prog(`Salvo ${items.length} schede…`);
    await batchSet(items);
    endProgress();
    toast(`Importati ${items.length} elementi e ${files.length} PDF`);
  }catch(e){console.error(e);prog(e.message==="formato"?"Il file scelto non è un backup Top House.":"Importazione non riuscita: controlla la connessione e riprova. I dati già caricati restano.",true)}
}
async function exportBackup(){
  if(!db)return;
  if(!window.JSZip){toast("Libreria per i file zip non caricata: ricarica la pagina");return}
  const prog=progress("Preparo il backup");
  try{
    const zip=new JSZip(), strip=({id,...d})=>d, dati={venditori:{},piani:{},accessi:{},azienda:{}};
    venditori.forEach(v=>dati.venditori[v.id]=strip(v)); piani.forEach(p=>dati.piani[p.id]=strip(p)); accessi.forEach(a=>dati.accessi[a.id]=strip(a)); if(azienda)dati.azienda[azienda.id]=strip(azienda);
    zip.file("data.json",JSON.stringify({formato:"tophouse-backup-1",esportato:new Date().toISOString(),dati},null,1));
    const ids=new Set();
    venditori.forEach(v=>Object.values(v.files||{}).flat().forEach(f=>ids.add(f.id)));
    piani.forEach(p=>(p.files||[]).forEach(f=>ids.add(f.id)));
    ((azienda&&azienda.files)||[]).forEach(f=>ids.add(f.id));
    let i=0,miss=0;
    for(const id of ids){prog(`Scarico i PDF: ${++i} di ${ids.size}`);try{zip.file(`files/${id}.pdf`,await getFile(id))}catch(e){miss++}}
    prog("Creo il file zip…");
    saveBlob(await zip.generateAsync({type:"blob"}),`Backup_TopHouse_${today()}.zip`);
    endProgress(); toast(miss?`Backup scaricato (${miss} PDF non trovati)`:"Backup scaricato");
  }catch(e){console.error(e);prog("Backup non riuscito. Riprova.",true)}
}

if(!configured){
  gate(`<h1 style="font-family:var(--display);font-size:22px;margin:0">Quasi pronta</h1><p>Manca la configurazione di Firebase. Inserisci i dati del progetto in <code>firebase-config.js</code> seguendo il README del repository.</p>`);
}else{
  gate(`<p>Caricamento…</p>`);
  watchAuth(u=>{
    stopData(); $("#acct").hidden=true; $("#menu").hidden=true;
    if(!u){gate(loginHtml());return}
    if(!isAllowed(u)){gate(`<h1 style="font-family:var(--display);font-size:22px;margin:0">Accesso non autorizzato</h1><p>L'account <b>${esc(u.email||"")}</b> non può aprire questo archivio.</p><button class="btn" data-action="logout">Esci e cambia account</button>`);return}
    gate(null); setUser(u); render(); startData();
  });
}

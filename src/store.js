import {FIREBASE_CONFIG} from '../config.js';
import {uid} from './utils.js';
const READY=Boolean(FIREBASE_CONFIG.apiKey&&FIREBASE_CONFIG.projectId&&!FIREBASE_CONFIG.apiKey.startsWith('INSERISCI'));
export const isDemo=!READY;
export let auth=null,db=null;
let sdk=null,watchers=[],userWatcher=null;
export const state={user:null,profile:null,vehicles:[],documents:{},maintenance:{},expenses:{},trash:{},users:[],loading:true,onChange:()=>{}};
const notify=()=>state.onChange?.();
const localKey='redline-demo-v1';
const demoData=()=>({vehicles:[
 {id:'golf-demo',brand:'Volkswagen',model:'Golf 8',trim:'2.0 TDI R-Line',plate:'AB123CD',year:2022,mileage:48620,fuel:'Diesel',power:'150 CV',color:'Grigio',vin:'',purchaseDate:'2022-05-14',purchasePrice:27000,notes:''},
 {id:'bmw-demo',brand:'BMW',model:'320d',trim:'M Sport',plate:'EF456GH',year:2020,mileage:70200,fuel:'Diesel',power:'190 CV',color:'Nero',vin:''},
 {id:'audi-demo',brand:'Audi',model:'A3 Sportback',trim:'35 TFSI',plate:'IJ789KL',year:2021,mileage:37500,fuel:'Benzina',power:'150 CV',color:'Bianco',vin:''}],
 documents:{'golf-demo':[{id:'doc1',category:'Assicurazione RCA',title:'Polizza RCA',dateStart:'2026-03-15',expiry:'2027-03-15',issuer:'Compagnia esempio',policy:'POL-000123',amount:600,notes:'Documento dimostrativo: non è una polizza reale.'},{id:'doc2',category:'Libretto / Documento Unico',title:'Carta di circolazione',notes:'Facsimile senza allegato reale'}]},
 maintenance:{'golf-demo':[{id:'m1',type:'Tagliando',date:'2026-09-21',mileage:47000,description:'Olio motore e filtri',workshop:'Officina esempio',cost:280},{id:'m2',type:'Pneumatici',date:'2026-03-06',mileage:41100,description:'Sostituzione pneumatici anteriori',cost:270}]},
 expenses:{'golf-demo':[{id:'e1',category:'Carburante',date:'2026-10-20',amount:85,description:'Rifornimento diesel'}]},trash:{},users:[]});
const demoSave=()=>localStorage.setItem(localKey,JSON.stringify({vehicles:state.vehicles,documents:state.documents,maintenance:state.maintenance,expenses:state.expenses,trash:state.trash,users:state.users}));
function initDemo(){let d;try{d=JSON.parse(localStorage.getItem(localKey))||demoData();}catch{d=demoData();}Object.assign(state,d,{user:{uid:'demo',email:'demo@redline.local',emailVerified:true},profile:{name:'Amministratore demo',role:'admin',status:'approved',email:'demo@redline.local'},loading:false});notify();}
export async function start(callback){state.onChange=callback;
 if(isDemo){initDemo();return;}
 const app=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js');
 const a=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js');
 const f=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js');sdk={a,f};
 const instance=app.initializeApp(FIREBASE_CONFIG,'redline-independent');auth=a.getAuth(instance);db=f.getFirestore(instance);
 // Alcuni browser mobili (Safari iOS, browser Android con blocco memoria)
 // non consentono la persistenza locale: non interrompere l'avvio dell'app.
 try { await a.setPersistence(auth,a.browserLocalPersistence); }
 catch (e) {
   console.warn('REDLINE: persistenza locale non disponibile',e?.code||e);
   try { await a.setPersistence(auth,a.browserSessionPersistence); }
   catch (e2) {
     console.warn('REDLINE: persistenza di sessione non disponibile',e2?.code||e2);
     try { await a.setPersistence(auth,a.inMemoryPersistence); }
     catch (e3) { console.warn('REDLINE: mantengo persistenza predefinita',e3?.code||e3); }
   }
 }
 a.onAuthStateChanged(auth,async user=>{
   detach();state.user=user;state.profile=null;state.vehicles=[];state.documents={};state.maintenance={};state.expenses={};state.trash={};state.users=[];state.loading=false;notify();
   if(!user)return;
   await user.reload().catch(()=>{});await user.getIdToken(true).catch(()=>{});
   if(!user.emailVerified){notify();return;}
   const ref=f.doc(db,'users',user.uid);let existing=await f.getDoc(ref).catch(()=>null);
   if(!existing?.exists()){
    const p={email:user.email,name:user.displayName||user.email.split('@')[0],role:'viewer',status:'pending',createdAt:new Date().toISOString()};
    // Owner bootstrap is authorized by rules only when configured owner email matches.
    try{await f.setDoc(ref,{...p,role:'admin',status:'approved'});}catch{
      try{await f.setDoc(ref,p);}catch(e){console.error('Registration profile',e);}
    }
   }
   userWatcher=f.onSnapshot(ref,s=>{state.profile=s.exists()?{id:s.id,...s.data()}:null;notify();
    detachData();if(state.profile?.status==='approved')watchData();
    if(state.profile?.role==='admin')watchUsers();
   },e=>{console.error(e);notify();});
 });
}
function detachData(){for(const unsub of watchers)try{unsub();}catch{}watchers=[];state.vehicles=[];state.documents={};state.maintenance={};state.expenses={};state.trash={};state.users=[];}
function detach(){detachData();if(userWatcher){userWatcher();userWatcher=null;}}
let dataSubOn=false;
function watchData(){if(watchers.length)return;const {f}=sdk;
 const un=f.onSnapshot(f.collection(db,'vehicles'),snap=>{
  const existing=new Set(state.vehicles.map(v=>v.id));state.vehicles=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.brand+a.model).localeCompare(b.brand+b.model));
  for(const v of state.vehicles){if(!existing.has(v.id))watchSubcollections(v.id);}
  notify();
 },console.error);watchers.push(un);
}
function watchSubcollections(vehicleId){const {f}=sdk;
 for(const key of ['documents','maintenance','expenses','trash']){
  const path=f.collection(db,'vehicles',vehicleId,key);
  const un=f.onSnapshot(path,s=>{state[key][vehicleId]=s.docs.map(x=>({id:x.id,...x.data()}));notify();},console.error);watchers.push(un);
 }
}
function watchUsers(){if(watchers.some(x=>x._redlineUser))return;const {f}=sdk;const un=f.onSnapshot(f.collection(db,'users'),s=>{state.users=s.docs.map(d=>({id:d.id,...d.data()}));notify();},console.error);un._redlineUser=true;watchers.push(un);}
export async function signIn(email,password){if(isDemo)return;await sdk.a.signInWithEmailAndPassword(auth,email.trim(),password);}
export async function register(email,password,name){if(isDemo)return;const created=await sdk.a.createUserWithEmailAndPassword(auth,email.trim(),password);await sdk.a.updateProfile(created.user,{displayName:name.trim()});await sdk.a.sendEmailVerification(created.user);return created.user;}
export async function resetPassword(email){if(isDemo)return;await sdk.a.sendPasswordResetEmail(auth,email);}
export async function verifyAgain(){if(isDemo)return;await sdk.a.sendEmailVerification(auth.currentUser);}
export async function refreshUser(){if(isDemo)return;await auth.currentUser?.reload();await auth.currentUser?.getIdToken(true);if(auth.currentUser?.emailVerified)location.reload();}
export async function logout(){if(isDemo){localStorage.removeItem(localKey);initDemo();return;}await sdk.a.signOut(auth);}
export const canEdit=()=>state.profile?.status==='approved'&&['admin','editor'].includes(state.profile.role);
export const isAdmin=()=>state.profile?.status==='approved'&&state.profile?.role==='admin';
export async function upsertVehicle(id,payload){if(!canEdit())throw Error('Permessi insufficienti');id=id||uid();const clean={...payload,updatedAt:new Date().toISOString()};if(isDemo){let i=state.vehicles.findIndex(x=>x.id===id);if(i<0)state.vehicles.push({id,...clean});else state.vehicles[i]={...state.vehicles[i],...clean};demoSave();notify();return id;}
 await sdk.f.setDoc(sdk.f.doc(db,'vehicles',id),clean,{merge:true});return id;}
export async function deleteVehicle(id){if(!isAdmin())throw Error('Solo l’amministratore può eliminare auto');
 for(const key of ['documents','maintenance','expenses','trash'])for(const item of [...(state[key][id]||[])])await removeRecord(key,id,item.id);
 const v=state.vehicles.find(x=>x.id===id);if(v?.photo)await disposeFile(id,'vehicle',id,v.photo).catch(()=>{});
 if(isDemo){state.vehicles=state.vehicles.filter(x=>x.id!==id);demoSave();notify();return;}
 await sdk.f.deleteDoc(sdk.f.doc(db,'vehicles',id));}
export async function upsertRecord(key,vehicleId,id,payload){if(!canEdit())throw Error('Permessi insufficienti');if(!['documents','maintenance','expenses','trash'].includes(key))throw Error('Tipo non valido');id=id||uid();const clean={...payload,updatedAt:new Date().toISOString()};if(isDemo){state[key][vehicleId]??=[];const i=state[key][vehicleId].findIndex(x=>x.id===id);if(i<0)state[key][vehicleId].push({id,...clean});else state[key][vehicleId][i]={...state[key][vehicleId][i],...clean};demoSave();notify();return id;}
 await sdk.f.setDoc(sdk.f.doc(db,'vehicles',vehicleId,key,id),clean,{merge:true});return id;}
export async function removeRecord(key,vehicleId,id){if(!canEdit())throw Error('Permessi insufficienti');const old=(state[key][vehicleId]||[]).find(x=>x.id===id);if(isDemo){state[key][vehicleId]=(state[key][vehicleId]||[]).filter(x=>x.id!==id);demoSave();notify();return;}
 await sdk.f.deleteDoc(sdk.f.doc(db,'vehicles',vehicleId,key,id));
 if(old?.attachment)await disposeFile(vehicleId,key==='documents'?'document':key==='expenses'?'expense':'maintenance',id,old.attachment).catch(async()=>{await queueDelete(vehicleId,key==='documents'?'document':key==='expenses'?'expense':'maintenance',id,old.attachment);});
}
export async function updateUser(id,role,status){if(!isAdmin())throw Error('Solo amministratore');if(id===state.user.uid&&(status!=='approved'||role!=='admin'))throw Error('Non puoi revocare il tuo account amministratore');if(!['admin','editor','viewer'].includes(role)||!['approved','pending','rejected'].includes(status))throw Error('Ruolo/stato non valido');
 if(isDemo){let u=state.users.find(x=>x.id===id);if(u)Object.assign(u,{role,status});demoSave();notify();return;}
 await sdk.f.updateDoc(sdk.f.doc(db,'users',id),{role,status,updatedAt:new Date().toISOString()});}
export async function getToken(){if(isDemo)return null;return auth.currentUser.getIdToken();}
async function queueDelete(vid,scope,recordId,attachment){if(isDemo)return;await upsertRecord('trash',vid,null,{scope,recordId,attachment});}
// This function is injected from files.js to keep state consistent.
let disposeFile=async()=>{};export function setDisposer(fn){disposeFile=fn;}
export async function replaceAttachment(vid,scope,recordId,oldAttachment,newAttachment){
 if(!oldAttachment?.fileId||oldAttachment.fileId===newAttachment?.fileId)return;
 try{await disposeFile(vid,scope,recordId,oldAttachment);}catch(e){await queueDelete(vid,scope,recordId,oldAttachment);throw Error('Nuovo documento salvato. Il precedente è in coda per l’eliminazione automatica.');}
}
export async function retryTrash(){if(!canEdit()||isDemo)return {ok:0,failed:0};let ok=0,failed=0;
 for(const v of state.vehicles)for(const item of (state.trash[v.id]||[])){
  try{await disposeFile(v.id,item.scope,item.recordId,item.attachment);await sdk.f.deleteDoc(sdk.f.doc(db,'vehicles',v.id,'trash',item.id));ok++;}catch{failed++;}
 }return {ok,failed};}
export function allData(){return {exportedAt:new Date().toISOString(),vehicles:state.vehicles,documents:state.documents,maintenance:state.maintenance,expenses:state.expenses};}

import {FILES_API,MAX_FILE_MB} from '../config.js';
import {getToken,isDemo,setDisposer} from './store.js';
const TYPES=['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif'];
const endpoint=(route)=>FILES_API.replace(/\/$/,'')+route;
export async function uploadFile(vid,scope,recordId,file,onProgress){
 if(!FILES_API)throw Error('Configura FILES_API in config.js per allegare i file');
 if(isDemo)throw Error('Allegati online disattivati in modalità demo: completa Firebase e Cloudflare');
 if(!TYPES.includes(file.type))throw Error('Sono ammessi PDF e immagini JPG, PNG, WebP, HEIC');
 if(file.size>MAX_FILE_MB*1048576)throw Error(`Il file supera ${MAX_FILE_MB} MB: riduci la dimensione prima del caricamento`);
 const u=new URL(endpoint('/upload'));u.searchParams.set('vehicleId',vid);u.searchParams.set('scope',scope);u.searchParams.set('recordId',recordId);
 onProgress?.('Caricamento in corso…');
 const r=await fetch(u,{method:'POST',headers:{Authorization:'Bearer '+await getToken(),'Content-Type':file.type,'X-Original-Name':encodeURIComponent(file.name).slice(0,160)},body:file});const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||'Caricamento fallito');return {...j,originalName:file.name};
}
export async function fetchFile(vid,scope,recordId,attachment){
 if(!attachment?.fileId)throw Error('Nessun file allegato');
 if(!FILES_API)throw Error('Archivio non configurato');
 const u=new URL(endpoint('/file'));for(const [k,v] of Object.entries({vehicleId:vid,scope,recordId,fileId:attachment.fileId}))u.searchParams.set(k,v);
 const r=await fetch(u,{headers:{Authorization:'Bearer '+await getToken()}});if(!r.ok){const d=await r.json().catch(()=>({}));throw Error(d.error||'Download non riuscito');}return r.blob();
}
export async function deleteFile(vid,scope,recordId,attachment){if(!attachment?.fileId)return;if(isDemo)return;
 const u=new URL(endpoint('/delete'));for(const [k,v] of Object.entries({vehicleId:vid,scope,recordId}))u.searchParams.set(k,v);
 const r=await fetch(u,{method:'POST',headers:{Authorization:'Bearer '+await getToken(),'Content-Type':'application/json'},body:JSON.stringify({fileId:attachment.fileId,fileName:attachment.fileName})});
 const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||'Impossibile eliminare il vecchio file');return j;
}
setDisposer(deleteFile);
export async function compressImage(file,maxSide=1800,quality=.79){if(!file.type.startsWith('image/')||file.type==='image/heic'||file.type==='image/heif')return file;
 const bmp=await createImageBitmap(file).catch(()=>null);if(!bmp)return file;
 const scale=Math.min(1,maxSide/Math.max(bmp.width,bmp.height)),w=Math.round(bmp.width*scale),h=Math.round(bmp.height*scale);
 const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(bmp,0,0,w,h);bmp.close?.();
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));
 if(!blob||blob.size>=file.size)return file;return new File([blob],file.name.replace(/\.[^.]+$/, '')+'.webp',{type:'image/webp'});
}
export async function downloadAttachment(vid,scope,recordId,att){const blob=await fetchFile(vid,scope,recordId,att);const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=att.originalName||'documento';a.click();setTimeout(()=>URL.revokeObjectURL(u),30000);}

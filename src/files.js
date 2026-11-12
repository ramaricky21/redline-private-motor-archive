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
// La conversione avviene sul dispositivo; il cloud riceve solo il file raster effettivamente prodotto.
async function decodedImage(file){
 if(typeof createImageBitmap==='function'){
  try{const bitmap=await createImageBitmap(file);return {source:bitmap,width:bitmap.width,height:bitmap.height,close:()=>bitmap.close?.()};}catch{}
 }
 const objectUrl=URL.createObjectURL(file),img=new Image();
 try{
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Formato immagine non leggibile dal browser'));img.src=objectUrl;});
  return {source:img,width:img.naturalWidth,height:img.naturalHeight,close:()=>URL.revokeObjectURL(objectUrl)};
 }catch(e){URL.revokeObjectURL(objectUrl);throw e;}
}
async function rasterBlob(file,maxSide,mime,quality){
 const image=await decodedImage(file);
 try{
  if(!image.width||!image.height)throw Error('Immagine non valida');
  const scale=Math.min(1,maxSide/Math.max(image.width,image.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  const context=canvas.getContext('2d');if(!context)throw Error('Impossibile elaborare la fotografia');
  // Il JPG non supporta trasparenza: utilizzare uno sfondo bianco.
  if(mime==='image/jpeg'){context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);}
  context.drawImage(image.source,0,0,canvas.width,canvas.height);
  return await new Promise(resolve=>canvas.toBlob(resolve,mime,quality));
 }finally{image.close();}
}
export async function prepareVehiclePhoto(file){
 if(file.size>25*1048576)throw Error('La fotografia supera 25 MB: scegline una più piccola');
 let blob;
 try{blob=await rasterBlob(file,1800,'image/jpeg',.84);}
 catch(e){throw Error('Impossibile leggere questa foto. Usa JPG, PNG, WebP, GIF, AVIF, BMP o HEIC se supportato dal dispositivo.');}
 if(!blob||blob.type!=='image/jpeg')throw Error('Conversione JPG non supportata dal dispositivo');
 // Conferma i magic bytes, così il server non riceve mai un Content-Type incoerente.
 const header=new Uint8Array(await blob.slice(0,3).arrayBuffer());
 if(header[0]!==0xff||header[1]!==0xd8||header[2]!==0xff)throw Error('Conversione JPG non valida');
 if(blob.size>MAX_FILE_MB*1048576)throw Error(`La foto supera ${MAX_FILE_MB} MB anche dopo la conversione`);
 const base=(file.name||'foto_auto').replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,70)||'foto_auto';
 return new File([blob],base+'.jpg',{type:'image/jpeg'});
}
export async function compressImage(file,maxSide=1800,quality=.79){
 if(!file.type.startsWith('image/')||file.type==='image/heic'||file.type==='image/heif')return file;
 let blob;try{blob=await rasterBlob(file,maxSide,'image/webp',quality);}catch{return file;}
 // Alcuni browser restituiscono PNG anche quando viene chiesto WebP: non falsare MIME/estensione.
 if(!blob||blob.size>=file.size)return file;
 const extensions={'image/webp':'.webp','image/png':'.png','image/jpeg':'.jpg'};
 const ext=extensions[blob.type];if(!ext)return file;
 return new File([blob],file.name.replace(/\.[^.]+$/,'')+ext,{type:blob.type});
}
export async function downloadAttachment(vid,scope,recordId,att){const blob=await fetchFile(vid,scope,recordId,att);const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=att.originalName||'documento';a.click();setTimeout(()=>URL.revokeObjectURL(u),30000);}

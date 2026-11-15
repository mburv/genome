import {openGenomePack,type GenomePack} from './genomePack.ts';
const DB='genome-reference-t2t-v1',STORE='chromosomes';
function database():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined'){reject(Error('Offline reference storage is unavailable'));return;}
    const req=indexedDB.open(DB,1);
    req.onupgradeneeded=()=>req.result.createObjectStore(STORE);
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
export async function storeGenomePack(pack:GenomePack):Promise<void>{
  const db=await database();
  try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(pack.file,pack.header.chromosome);
    tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??Error('Reference storage failed'));tx.onerror=()=>reject(tx.error);
  });}finally{db.close();}
}
export async function loadGenomePacks():Promise<Record<string,GenomePack>>{
  const db=await database();
  try{
    const blobs=await new Promise<Blob[]>((resolve,reject)=>{
      const req=db.transaction(STORE,'readonly').objectStore(STORE).getAll();
      req.onsuccess=()=>resolve(req.result as Blob[]);req.onerror=()=>reject(req.error);
    });
    const out:Record<string,GenomePack>={};
    for(const file of blobs){const pack=await openGenomePack(file);out[pack.header.chromosome]=pack;}
    return out;
  }finally{db.close();}
}

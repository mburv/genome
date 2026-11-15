import { CHROMOSOMES, CHUNK_BASES, REFERENCE, type GenomeHeader, type Interval } from '../campaign/bonus.ts';
const MAGIC='GENOME-T2T-1';
const MD5='06caded0055ec647a69acb708e13beff';
const ALPHABET='ACGT';
export interface GenomePack {file:File; header:GenomeHeader; offset:number}
export async function openGenomePack(file:File):Promise<GenomePack>{
  const prefix=await file.slice(0,4).arrayBuffer();
  if(prefix.byteLength!==4)throw Error('Incomplete data pack');
  const n=new DataView(prefix).getUint32(0,true);
  if(n<1||n>20_000_000||file.size<4+n)throw Error('Invalid data pack header');
  const h=JSON.parse(await file.slice(4,4+n).text()) as GenomeHeader;
  if(h.format!==MAGIC||h.reference!==REFERENCE||h.sourceMd5!==MD5||h.length!==CHROMOSOMES[h.chromosome]||h.chunkBases!==CHUNK_BASES||!Array.isArray(h.genes)||!Array.isArray(h.chunkSha256)||h.chunkSha256.length!==Math.ceil(h.length/CHUNK_BASES)||!h.chunkSha256.every(x=>/^[a-f0-9]{64}$/.test(x))||file.size!==4+n+Math.ceil(h.length/4))throw Error('Wrong reference or damaged data pack');
  if(!h.genes.every(g=>Array.isArray(g)&&g.length===6&&Number.isInteger(g[3])&&Number.isInteger(g[4])&&g[3]>=0&&g[4]<=h.length&&g[3]<g[4]))throw Error('Invalid gene catalogue');
  return {file,header:h,offset:4+n};
}
async function readChunk(pack:GenomePack,index:number):Promise<Uint8Array>{
  const start=index*CHUNK_BASES,end=Math.min(pack.header.length,start+CHUNK_BASES);
  const bytes=new Uint8Array(await pack.file.slice(pack.offset+start/4,pack.offset+Math.ceil(end/4)).arrayBuffer());
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const hex=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
  if(hex!==pack.header.chunkSha256[index])throw Error('Reference checksum mismatch; replace the data pack');
  return bytes;
}
export async function readGenomeSequence(pack:GenomePack,[start,end]:Interval):Promise<string>{
  if(start<0||end>pack.header.length||end<=start||end-start>864)throw Error('Invalid puzzle coordinates');
  let out='';let at=start;
  while(at<end){
    const index=Math.floor(at/CHUNK_BASES),base=index*CHUNK_BASES;
    const data=await readChunk(pack,index),stop=Math.min(end,base+CHUNK_BASES);
    for(;at<stop;at++){const i=at-base;out+=ALPHABET[(data[i>>>2]!>>((3-(i&3))*2))&3];}
  }return out;
}

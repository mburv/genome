// Build-time expansion. The original M2/M4 packs are immutable for existing saves.
import { readFileSync,writeFileSync } from 'node:fs';
import { buildLevel,validateLevel,type LevelSpec,type GeneSource } from '../src/generator/level.ts';
import { M2_SPECS } from '../src/campaign/specs.ts';
import { chapterSpecs,geneRunCoverageErrors,tierName,TOKEN_GENERATOR_VERSION } from '../src/campaign/chapters.ts';
import type { LevelDefinition } from '../src/engine/types.ts';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const legacy=read('src/campaign/chapters.generated.json') as {levels:LevelDefinition[];datasets:Record<string,string>};
const m2=read('src/campaign/levels.generated.json') as {levels:LevelDefinition[]};
const manifest=read('src/genomics/manifest.generated.json') as {catalogueId:string;included:{symbol:string;cdsLength:number;datasetId:string}[]};
const catalog=read('src/genomics/catalogue.generated.json') as {genes:GeneSource[]};
const genes:Record<string,GeneSource>=Object.fromEntries([read('src/genomics/ins.generated.json'),read('src/genomics/hbb.generated.json'),...catalog.genes].map(g=>[g.symbol,g]));
const all=[...m2.levels,...legacy.levels];
const generated:LevelDefinition[]=[];
const replaced:Record<string,string[]>={};
const add=(spec:LevelSpec,gene:GeneSource)=>{
  const def={...buildLevel(spec,gene,all),generatorVersion:TOKEN_GENERATOR_VERSION};
  // Reuse a few real decoys if a board exceeds the 65-colour contrast-safe prefix.
  // Target symbols, masks, scramble moves and solution certificates stay intact.
  if(def.tokens){
    const decoys=Object.keys(def.tokens).filter(s=>def.tokens![s]!.kind==='decoy');
    while(Object.keys(def.tokens).length>65){
      const remove=decoys.pop()!,keep=decoys[0]!;
      def.initial=def.initial.split(remove).join(keep);
      def.solved=def.solved.split(remove).join(keep);
      delete def.tokens[remove];
    }
  }
  all.push(def);generated.push(def);
  console.log(def.id,def.sourceIntervals[0],def.tier??1,def.metrics.certificateDrags);
};
for(const [gi,g] of manifest.included.entries()){
  if(g.symbol==='INS'||g.symbol==='HBB') continue;
  const gene=genes[g.symbol]!,sym=g.symbol.toLowerCase(),old=legacy.levels.find(l=>l.symbol===g.symbol);
  const introEnd=old?old.sourceIntervals[0]!.end:27;
  if(introEnd!==27) throw Error(g.symbol+' original opening is not 27 bases');
  const intros:string[]=[];
  for(let i=0;i<3;i++){
    const template=M2_SPECS[[0,1,3][i]!]!;
    const id=sym+'-i0'+(i+1);intros.push(id);
    add({...template,id,index:all.length,gene:g.symbol,seed:900000+gi*1009+i*37,source:{start:i*9,end:(i+1)*9},title:['First drag','Find the strand','Repair the sequence'][i]!,solverBudget:4000},gene);
  }
  if(old){replaced[old.id]=intros;continue;}
  // Small genes follow established 3/6/12/24 tiers. Larger ones start with a
  // 900-base chapter ramp, then use 48/96-base tiles with bounded board sizes.
  const firstEnd=g.cdsLength-27>1131?927:g.cdsLength;
  const specs=chapterSpecs({symbol:g.symbol,cdsLength:firstEnd},gi,all.length,27);
  let pos=firstEnd;
  let k=48;
  while(pos<g.cdsLength){
    const remain=g.cdsLength-pos;
    const size=Math.min(k,Math.floor(remain/9)*3);
    let take=Math.min(remain,12*size);
    const nextK=96;
    if(remain>take&&remain-take<3*nextK)take-=Math.ceil((3*nextK-(remain-take))/size)*size;
    const count=Math.ceil(take/size);
    if(count<3||count>12) throw Error('invalid tail '+g.symbol+' '+count);
    const mode=count<=9?'sequence':'splice';
    const layout=mode==='sequence'?{kind:'sequence' as const,orientation:'horizontal' as const}:{kind:'splice' as const,parts:[{length:Math.ceil(count/2),orientation:'horizontal' as const},{length:Math.floor(count/2),orientation:'vertical' as const}]};
    const template=specs.at(-1)!;
    specs.push({...template,id:sym+'-c'+String(specs.length+1).padStart(2,'0'),index:all.length+specs.length,seed:5000000+gi*1009+specs.length*37,source:{start:pos,end:pos+take},title:tierName(size)+' · '+(pos+take===g.cdsLength?'finale':'sequencing'),mode,layout,tokenSize:size,minWrongCells:Math.min(5,count-1),scrambleDrags:4,minDrags:3,solverBudget:4000});
    pos+=take;k=96;
  }
  const total=specs.length;
  for(const [i,spec] of specs.entries())add({...spec,index:all.length,chapter:{part:i+1,of:total},solverBudget:4000},gene);
}
const live=[...m2.levels,...legacy.levels.filter(l=>!replaced[l.id]),...generated];
for(const g of manifest.included){
  const errors=geneRunCoverageErrors(live,g.symbol,g.cdsLength);
  if(errors.length)throw Error(errors.join('\n'));
}
for(const l of generated){
  const errors=validateLevel(l,genes[l.symbol]!,live);
  if(errors.length)throw Error(errors.join('\n'));
}
const out=JSON.stringify({catalogueId:manifest.catalogueId,replaced,levels:generated},null,2)+'\n';
const path='src/campaign/famous.generated.json';
if(process.argv.includes('--check')){
  if(readFileSync(path,'utf8')!==out)throw Error('Famous Genes pack differs from deterministic generation');
}else writeFileSync(path,out);
console.log('Verified',generated.length,'new puzzles;',live.length,'total incl. labs');

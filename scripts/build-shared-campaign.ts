/** Rebuild only changed reference genes; keep existing masks and boards for identical CDSs. */
import {readFileSync,writeFileSync} from 'node:fs';
import {buildLevel,validateLevel,type GeneSource,type LevelSpec,type TrackLayout} from '../src/generator/level.ts';
import {ALL_SPECS,M2_SPECS} from '../src/campaign/specs.ts';
import {chapterSpecs,geneRunCoverageErrors,TOKEN_GENERATOR_VERSION} from '../src/campaign/chapters.ts';
import type {LevelDefinition} from '../src/engine/types.ts';
import {defaultLabel} from '../src/engine/tokens.ts';
const read=<T>(p:string)=>JSON.parse(readFileSync(p,'utf8')) as T;
type Mapping={sequence:string;sequenceSha256:string;chromosome:string;strand:string;intervals:[number,number][];transcript:string};
const mapping=read<Record<string,Mapping>>('src/genomics/famous-t2t.generated.json');
const oldGenes=Object.fromEntries([read<GeneSource>('src/genomics/ins.generated.json'),read<GeneSource>('src/genomics/hbb.generated.json'),...read<{genes:GeneSource[]}>('src/genomics/catalogue.generated.json').genes].map(g=>[g.symbol,g]));
const m2=read<{levels:LevelDefinition[]}>('src/campaign/levels.generated.json').levels;
const chapters=read<{levels:LevelDefinition[]}>('src/campaign/chapters.generated.json').levels;
const famous=read<{levels:LevelDefinition[];replaced:Record<string,string[]>}>('src/campaign/famous.generated.json');
const live=[...m2,...chapters.filter(l=>!famous.replaced[l.id]).map(l=>famous.replaced[l.symbol.toLowerCase()+'-c01']&&l.chapter?{...l,chapter:{part:l.chapter.part-1,of:l.chapter.of-1}}:l),...famous.levels];
const dataset=(symbol:string)=>'t2t-chm13v2.0-'+symbol+'-'+mapping[symbol]!.sequenceSha256.slice(0,12);
const changed=Object.keys(mapping).filter(s=>mapping[s]!.sequence!==oldGenes[s]!.sequence);
const geneSource=(symbol:string):GeneSource=>({...oldGenes[symbol]!,sequence:mapping[symbol]!.sequence,sequenceSha256:mapping[symbol]!.sequenceSha256,datasetId:dataset(symbol)});
// Preserve every board whose targets AND decoys are still exact in the new reference.
// Reserve its mask before generating any replacements, so unique-mask guarantees remain intact.
const retained=new Map<string,LevelDefinition>();
function refreshDecoys(l:LevelDefinition,gene:GeneSource):LevelDefinition{
  if(!l.tokens)return l;
  // Only preserve a board when its complete target interval is unchanged.
  const iv=l.sourceIntervals[0]!;
  if(oldGenes[l.symbol]!.sequence.slice(iv.start,iv.end)!==gene.sequence.slice(iv.start,iv.end))return l;
  const tokens=structuredClone(l.tokens),used=new Set(Object.values(tokens).filter(t=>t.kind==='target').map(t=>t.seq));
  const valid=(a:number,b:number)=>a>=0&&b<=gene.sequence.length&&a%3===0&&(b<=iv.start||a>=iv.end);
  const pending=Object.values(tokens).filter(t=>t.kind==='decoy');
  // Keep every valid original decoy reserved before replacing the obsolete ones.
  const invalid=pending.filter(t=>!t.source||!valid(t.source.start,t.source.end)||gene.sequence.slice(t.source.start,t.source.end)!==t.seq);
  for(const t of pending)if(!invalid.includes(t))used.add(t.seq);
  for(const t of invalid){
    const k=t.seq.length;let pos=-1;
    // Prefer the original sequence at another genuine location, then its old coordinates, then a fresh in-frame slice.
    for(let a=0;a+k<=gene.sequence.length;a+=3)if(valid(a,a+k)&&gene.sequence.slice(a,a+k)===t.seq&&!used.has(t.seq)){pos=a;break;}
    if(pos<0&&t.source&&valid(t.source.start,t.source.start+k)&&!used.has(gene.sequence.slice(t.source.start,t.source.start+k)))pos=t.source.start;
    if(pos<0)for(let a=0;a+k<=gene.sequence.length;a+=3)if(valid(a,a+k)&&!used.has(gene.sequence.slice(a,a+k))){pos=a;break;}
    if(pos<0)return l;
    t.seq=gene.sequence.slice(pos,pos+k);t.source={start:pos,end:pos+k};used.add(t.seq);
  }
  if(!invalid.length)return l;
  const labels=new Map<string,number>();
  for(const t of Object.values(tokens)){const base=defaultLabel(t.seq),n=labels.get(base)??0;labels.set(base,n+1);t.label=n?base+'·'+(n+1):base;}
  return {...l,tokens};
}
for(const l of live){
 if(!changed.includes(l.symbol))continue;
 const gene=geneSource(l.symbol),end=l.sourceIntervals.at(-1)!.end;
 if(end>gene.sequence.length||(l.chapter&&l.chapter.part===l.chapter.of&&gene.sequence.length!==oldGenes[l.symbol]!.sequence.length))continue;
 const updated=refreshDecoys({...l,datasetId:gene.datasetId,sequenceSha256:gene.sequenceSha256},gene);
 if(!validateLevel(updated,gene,live).length)retained.set(l.id,updated);
}
const all:LevelDefinition[]=live.filter(l=>!changed.includes(l.symbol)).concat([...retained.values()]);
const out:LevelDefinition[]=[];
const layoutFor=(l:LevelDefinition):TrackLayout=>{
  const t=l.tracks[0]!;
  if(l.mode==='sequence')return {kind:'sequence',orientation:t.orientation};
  if(l.mode==='replicate')return {kind:'replicate',orientation:t.orientation};
  if(l.mode==='repair')return {kind:'repair',orientation:t.orientation,gapIndex:t.cells.length};
  return {kind:'splice',parts:l.tracks.map(t=>({length:t.cells.length,orientation:t.orientation}))};
};
function compact(def:LevelDefinition){
  if(def.tokens){
    const decoys=Object.keys(def.tokens).filter(s=>def.tokens![s]!.kind==='decoy');
    while(Object.keys(def.tokens).length>65){
      const remove=decoys.pop()!,keep=decoys[0]!;
      if(!remove||!keep)throw Error('Cannot compact token table');
      def.initial=def.initial.split(remove).join(keep);def.solved=def.solved.split(remove).join(keep);delete def.tokens[remove];
    }
  }
  return def;
}
function rebuild(old:LevelDefinition,source:{start:number;end:number},gene:GeneSource,part?:{part:number;of:number},extra=false){
  const keep=retained.get(old.id);
  if(keep&&!extra&&source.start===keep.sourceIntervals[0]!.start&&source.end===keep.sourceIntervals.at(-1)!.end){out.push({...keep,...(part?{chapter:part}:{})});return;}
  const original=ALL_SPECS.find(s=>s.id===old.id);
  const template=original??(old.chapter?undefined:M2_SPECS[0])??chapterSpecs({symbol:gene.symbol,cdsLength:927},Object.keys(mapping).indexOf(gene.symbol),old.index,27)[Math.min((old.chapter?.part??1)-1,5)]!;
  let layout=layoutFor(old),mode=old.mode,tokenSize=old.tier;
  let cells=Math.ceil((source.end-source.start)/(tokenSize??1));
  const oldCells=old.mode==='repair'?9:old.mode==='replicate'?old.tracks[0]!.cells.length:old.tracks.reduce((n,t)=>n+t.cells.length,0);
  if(cells!==oldCells||extra){
    if(cells<3&&tokenSize){tokenSize=Math.max(3,Math.floor((source.end-source.start)/9)*3);cells=Math.ceil((source.end-source.start)/tokenSize);}
    if(cells<3||cells>12)throw Error('Unsupported chapter tail '+gene.symbol+' '+cells);
    mode=cells<=9?'sequence':'splice';
    layout=mode==='sequence'?{kind:'sequence',orientation:'horizontal'}:{kind:'splice',parts:[{length:Math.ceil(cells/2),orientation:'horizontal'},{length:Math.floor(cells/2),orientation:'vertical'}]};
  }
  const spec:LevelSpec={...template,id:old.id,index:old.index,gene:gene.symbol,title:old.title,mode,seed:old.seed,source,layout,tutorial:old.tutorial,
    scrambleDrags:original?original.scrambleDrags:old.tutorial?1:Math.max(3,old.metrics.certificateDrags),minDrags:original?original.minDrags:old.tutorial?1:Math.min(3,old.metrics.solver.lowerBound),minWrongCells:original?original.minWrongCells:Math.min(old.tutorial?1:4,cells-1),...(original?{}:{solverBudget:4000}),
    ...(tokenSize?{tokenSize}:{}),...(part?{chapter:part}:{}),...(old.lab?{lab:old.lab}:{})};
  const def=compact({...buildLevel(spec,gene,all),generatorVersion:old.generatorVersion??TOKEN_GENERATOR_VERSION});
  all.push(def);out.push(def);
}
for(const symbol of changed){
  const gene=geneSource(symbol),run=live.filter(l=>l.symbol===symbol&&!l.lab).sort((a,b)=>a.sourceIntervals[0]!.start-b.sourceIntervals[0]!.start);
  const intros=run.filter(l=>!l.chapter),ch=run.filter(l=>l.chapter);
  for(const l of intros)rebuild(l,{start:l.sourceIntervals[0]!.start,end:l.sourceIntervals.at(-1)!.end},gene);
  let pos=intros.at(-1)!.sourceIntervals.at(-1)!.end;
  const plans:{old:LevelDefinition;start:number;end:number;extra:boolean}[]=[];
  for(const l of ch){
    if(pos>=gene.sequence.length)break;
    const last=l===ch.at(-1);
    let end=Math.min(gene.sequence.length,l.sourceIntervals.at(-1)!.end);
    if(last)end=Math.min(gene.sequence.length,pos+12*(l.tier??3));
    if(end<=pos)continue;
    if(gene.sequence.length-end>0&&gene.sequence.length-end<9)end=gene.sequence.length;
    plans.push({old:l,start:pos,end,extra:false});pos=end;
  }
  while(pos<gene.sequence.length){
    const prev=ch.at(-1)!,end=Math.min(gene.sequence.length,pos+864);
    const part=plans.length+1;
    const old={...prev,id:symbol.toLowerCase()+'-c'+String(part).padStart(2,'0'),index:10000+Object.keys(mapping).indexOf(symbol)*100+part,seed:prev.seed+part*1009,tier:96};
    plans.push({old,start:pos,end,extra:true});pos=end;
  }
  for(const [i,p] of plans.entries())rebuild(p.old,{start:p.start,end:p.end},gene,{part:i+1,of:plans.length},p.extra);
  for(const l of live.filter(l=>l.symbol===symbol&&l.lab))rebuild(l,{start:l.sourceIntervals[0]!.start,end:l.sourceIntervals.at(-1)!.end},gene);
  const errors=geneRunCoverageErrors(all,symbol,gene.sequence.length);if(errors.length)throw Error(errors.join('\n'));
  console.log(symbol,'rebuilt',out.filter(l=>l.symbol===symbol).length,'levels');
}
for(const l of out){const errors=validateLevel(l,geneSource(l.symbol),all);if(errors.length)throw Error(l.id+': '+errors.join('; '));}
const data={changed,levels:out};
writeFileSync('src/campaign/shared.generated.json',JSON.stringify(data)+'\n');
console.log('Shared campaign validated',out.length,'levels for',changed.length,'genes; retained',retained.size,'unchanged boards');

import { DEFAULT_LAB_SPEC,createLab,applyLab,reverseComplement,mutationExpected, type LabSpec,type LabId,type LabAction } from '../engine/mechanicsLab.ts';
import { alignedComplement } from '../genomics/dna.ts';
import { defaultLabel,tokenSymbol,type TokenDef } from '../engine/tokens.ts';
import type { LevelDefinition } from '../engine/types.ts';
import type { MixedStage } from './mixed.ts';
const snake=(n:number,row=1)=>Array.from({length:n},(_,i)=>{const r=Math.floor(i/9)+row;return r*9+(r%2?8-i%9:i%9);});
/** Exact pieces at the same tier as the sliding alternative. Complement and
 * synthetic error/adapter pieces are explicitly separate from coding credit. */
export function blockStage(def:Pick<LevelDefinition,'id'|'symbol'|'tier'|'tokens'|'index'>,mechanic:LabId,start:number,end:number,sequence:string):MixedStage{
  const k=def.tier!;
  const chunks=Array.from({length:Math.ceil(sequence.length/k)},(_,i)=>sequence.slice(i*k,(i+1)*k));
  const tokens:Record<string,TokenDef>={},bySeq=new Map<string,string>();
  const add=(seq:string,kind:TokenDef['kind']='target')=>{
    const old=bySeq.get(seq);if(old)return old;
    const sym=tokenSymbol(bySeq.size);bySeq.set(seq,sym);
    const label=defaultLabel(seq);const same=Object.values(tokens).filter(t=>t.label===label||t.label.startsWith(label+'·')).length;
    tokens[sym]={seq,kind,label:same?label+'·'+(same+1):label};return sym;
  };
  const target=chunks.map(s=>add(s)).join('');
  const targetSet=new Set(chunks);
  const decoys=(mechanic==='trace'||mechanic==='crush'?Object.values(def.tokens??{}):[]).filter(t=>t.kind==='decoy'&&!targetSet.has(t.seq)).slice(0,12).map(t=>add(t.seq,'decoy'));
  if(!decoys.length&&(mechanic==='trace'||mechanic==='crush')){
    const seq=chunks[0]!;let other=seq;
    for(let i=0;targetSet.has(other);i++)other=seq.slice(0,i%seq.length)+('ACGT'[('ACGT'.indexOf(seq[i%seq.length]!)+1+Math.floor(i/seq.length))%4]!)+seq.slice(i%seq.length+1);
    decoys.push(add(other,'decoy'));
  }
  const spec:LabSpec={...DEFAULT_LAB_SPEC,tokens,blockSize:k,blockFill:decoys};
  let certificate:LabAction[]=[];
  if(mechanic==='trace'){
    spec.TRACE_TARGET=target;spec.TRACE_PATH=snake(target.length);
    spec.traceHoles=[0,8,27,44,53,72,80].filter(c=>!spec.TRACE_PATH.includes(c));
    certificate=spec.TRACE_PATH.slice(2).map(cell=>({type:'trace',cell}));
  }else if(mechanic==='crush'){
    spec.CRUSH_TARGETS=target.match(/.{3}/g)!;
    const board=Array.from({length:81},(_,i)=>[0,8,72,80].includes(i)?'.':decoys[i%decoys.length]!);
    const swaps: [number,number][]=[];
    spec.CRUSH_TARGETS.forEach((t,i)=>{
      const a=(i*2+1)*9+3,b=a+1;
      board[a-2]=t[0]!;board[a-1]=t[1]!;
      const auto=i===1&&t!==spec.CRUSH_TARGETS[0];
      board[a]=auto?t[2]!:decoys[0]!;board[b]=auto?decoys[0]!:t[2]!;
      swaps.push([a,b]);
    });
    spec.CRUSH_SWAPS=swaps;spec.crushBoard=board;spec.crushHoles=[0,8,72,80];
    let state=createLab('crush',spec);
    while(!state.won){
      const [a,b]=swaps[state.collected]!;
      const action={type:'swap' as const,a,b};
      const next=applyLab(state,action).state;
      if(next===state)throw Error(def.id+' block crush certificate stalled');
      certificate.push(action);state=next;
    }
  }else if(mechanic==='mutation'){
    const rows=[1,4,7];const blockComplements:Record<string,string>={},mutationOptions:Record<number,string[]>={},mutationInitial:Record<number,string>={};
    let at=0;
    spec.MUTATION_ROWS=rows.map((r,i)=>{
      const width=Math.ceil((target.length-at)/(3-i));const seq=target.slice(at,at+width);at+=width;
      return {top:r*9+1,bottom:(r+1)*9+1,seq};
    }).filter(r=>r.seq.length>0);
    const mutations:number[]=[];
    for(const r of spec.MUTATION_ROWS){
      for(const [i,sym] of [...r.seq].entries()){
        const cell=r.bottom+i,seq=alignedComplement(tokens[sym]!.seq),correct=add(seq);
        blockComplements[sym]=correct;blockComplements[correct]=sym;
        const opts=[correct,...[...'ACGT'].filter(b=>b!==seq[0]).map(b=>add(b+seq.slice(1),'decoy'))];
        const shift=(cell+def.index)%opts.length;mutationOptions[cell]=[...opts.slice(shift),...opts.slice(0,shift)];
        if(i===0||i===r.seq.length-1){mutations.push(cell);mutationInitial[cell]=opts[1]!;}
      }
    }
    spec.MUTATIONS=mutations;spec.blockComplements=blockComplements;spec.mutationOptions=mutationOptions;spec.mutationInitial=mutationInitial;
    certificate=mutations.map(cell=>({type:'edit',cell,base:mutationExpected(cell,spec)!}));
  }else if(mechanic==='assembly'){
    const n=target.length,len=Math.min(n,Math.max(2,Math.ceil(n*.6)));
    const offsets=[n-len,0,Math.floor((n-len)/2)];
    spec.ASSEMBLY_TARGET=target;spec.READ_STARTS=offsets;spec.READS=offsets.map(i=>target.slice(i,i+len));
    spec.READ_CELLS=[0,2,4].map(r=>Array.from({length:len},(_,i)=>r*9+i+1));
    spec.ASSEMBLY_CELLS=Array.from({length:n},(_,i)=>63+i);
    certificate=offsets.map((offset,read)=>({type:'place',read,offset}));
  }else if(mechanic==='connections'){
    let at=0;
    spec.CONNECTION_PAIRS=DEFAULT_LAB_SPEC.CONNECTION_PAIRS.map((p,i)=>{
      const count=Math.ceil((chunks.length-at)/(3-i));const seq=chunks.slice(at,at+count).join('');at+=count;
      return {...p,seq:add(seq),complement:add(reverseComplement(seq))};
    });
    certificate=spec.CONNECTION_ROUTES.flatMap((route,pair)=>route.map(cell=>({type:'route',pair,cell})));
  }else{
    const left=add('GGTCTCA','decoy'),right=add('AAAAAGAGACC','decoy');
    const strand=snake(target.length+2,1),decoy=[72,73,74];
    spec.enzyme='BsaI';spec.CUT_STRANDS=[strand,decoy];spec.CUT_SEQUENCES=[left+target+right,left+add('AC','decoy')+right];
    spec.CUT_TARGET=target;spec.CUT_SOLUTION=[strand[0]!,strand[strand.length-2]!];
    spec.CUT_SITES=[...spec.CUT_SOLUTION,decoy[0]!];
    certificate=spec.CUT_SOLUTION.map(cell=>({type:'cut',cell}));
  }
  return {id:def.id,symbol:def.symbol,mechanic,start,end,sequence,spec,certificate};
}

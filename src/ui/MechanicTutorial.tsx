import { TokenFace,tierClass,tokenStyle } from './TokenFace.tsx';
import { MUTATION_RAIL_CELLS } from './MechanicsLab.tsx';
import { useState, type CSSProperties, type KeyboardEvent } from 'react';
import { ALL_LEVELS } from '../campaign/campaign.ts';
import { isSlidingTutorial, type TutorialId, type MixedStage } from '../campaign/mixed.ts';
import { MODE_LABEL } from './modes.ts';
import type { LevelMode, Track } from '../engine/types.ts';
import { applySlide, segmentCells } from '../engine/grid.ts';
import { applyLab, createLab, DEFAULT_LAB_SPEC, LAB_META, mutationExpected, labReplacementOptions, labDecode,labLabel,type LabSpec,type LabAction, type LabState, type CrushTransition } from '../engine/mechanicsLab.ts';

type CrushDemo = { phase: 'swap' | 'settle'; a: number; b: number; frame: CrushTransition };
type Step = { tracks?: Track[]; repair?: {cell:number; expected:string}; crush?: CrushDemo; title: string; text: string; before: string[]; after: string[]; cells: number[]; path?: number[]; pathBefore?: number[]; cursor?: [number, number]; cut?: number[]; target?: string; motion?: { cells: number[]; axis: 'row' | 'col'; steps: number } };
const run = (state: LabState, actions: readonly LabAction[]) => actions.reduce((s,a) => applyLab(s,a).state,state);
const step = (title: string, text: string, before: LabState, after: LabState, cells: number[], cursor?: [number,number], path?: number[], target?: string): Step => ({title,text,before:before.board,after:after.board,cells,...(cursor ? {cursor} : {}),...(path ? {path} : {}),...(target ? {target} : {})});
const slideMode = { slide: 'sequence', 'slide-splice': 'splice', 'slide-replicate': 'replicate', 'slide-repair': 'repair' } as const;
function demonstration(mechanic: TutorialId, stage: MixedStage | null): Step[] {
  if (isSlidingTutorial(mechanic)) {
    const mode: LevelMode = slideMode[mechanic];
    const def = ALL_LEVELS.find(l => l.id === ({sequence:'ins-01',splice:'ins-02',replicate:'ins-03',repair:'ins-04'} as const)[mode])!;
    const move = def.certificate[0]!;
    const cells = segmentCells(def.mask,move.origin,move.axis);
    const i = Math.max(move.direction < 0 ? 1 : 0, Math.min(cells.length - (move.direction > 0 ? 2 : 1), Math.floor(cells.length / 2)));
    const origin = cells[i]!, end = cells[i + move.direction]!;
    const after = applySlide(def.mask,def.initial,move.origin,move.axis,move.direction).board;
    const target = def.tracks[0]!.expected;
    const goals = def.tracks.flatMap(t=>t.cells);
    const shared = {tracks:def.tracks,...(def.repair ? {repair:def.repair} : {}),...(mode==='sequence'?{target}:{})};
    const copy = {
      sequence: ['Read the target','Build the DNA shown in the clue. The marked cells must spell the sequence in order.','Match all clues','Keep sliding until every target base is in its marked slot. Undo reverses a move; Hint shows the next recovery move.'],
      splice: ['Read the numbered pieces','Each numbered group is a different part of the reference. Match every group to its own clue, in the direction shown by its marked cells.','Join the pieces in order','When all groups match at the same time, pieces 1, 2 and so on join into the reference strand. Correct pieces can still move until the puzzle is complete.'],
      replicate: ['Read the paired strands','Match the 5′→3′ template and its aligned 3′→5′ complement. A pairs with T; C pairs with G. Both strands have their own marked cells.','Complete both strands','Both aligned strands must match simultaneously. Only the template contributes new coding bases.'],
      repair: ['Find the missing base','The gap is marked between two target groups. Match the DNA on both sides. The gap is not a movable tile and cannot be crossed.','Restore the gap','Match both flanks at the same time. The missing reference base appears automatically when you win — no editing or power-up is needed.'],
    }[mode];
    const axis = move.axis === 'col' ? 'column' : 'row';
    const direction = move.axis === 'col' ? (move.direction < 0 ? 'up' : 'down') : (move.direction < 0 ? 'left' : 'right');
    return [
      {title:copy[0]!,text:copy[1]!,before:[...def.initial],after:[...def.initial],cells:goals,...shared},
      {title:'Slide the whole '+axis,text:'Swipe '+direction+' one square. Every tile in the '+axis+' segment moves together and wraps around. Holes stop a segment. Rows and columns work the same way.',before:[...def.initial],after:[...after],cells,cursor:[origin,end],motion:{cells,axis:move.axis,steps:move.direction},...shared},
      {title:copy[2]!,text:copy[3]!,before:[...after],after:[...def.solved],cells:goals,...shared},
    ];
  }
  const s = stage?.mechanic === mechanic ? stage.spec : DEFAULT_LAB_SPEC;
  const start = createLab(mechanic,s);
  if (mechanic === 'trace') {
    const p=s.TRACE_PATH, a=p[0]!, b=p[1]!, c=p[2]!;
    const next=run(start,[{type:'trace',cell:c}]);
    const prefix=[a,b];
    return [
      {...step('Continue the starter strand','The first two letters are already joined. Find the third letter in the target and continue from the end of the blue path.',start,start,prefix,undefined,undefined,s.TRACE_TARGET),pathBefore:prefix},
      {...step('Trace in order','Drag from the last connected tile to the next matching neighbour, or tap it. No diagonals, holes or reused cells.',start,next,[a,b,c],[b,c],[b,c],s.TRACE_TARGET),pathBefore:prefix},
      {...step('Finish the strand','Continue until every target base has been traced. Lift your finger and continue with taps if needed; Undo backtracks to the starter pair.',next,run(start,p.slice(2).map(cell=>({type:'trace',cell}))),[...p],undefined,[...p.slice(2)],s.TRACE_TARGET),pathBefore:[a,b,c]},
    ];
  }
  if (mechanic === 'crush') {
    const [a,b]=s.CRUSH_SWAPS[0]!, action:LabAction={type:'swap',a,b};
    const result=applyLab(start,action), frame=result.crush;
    if (!frame) throw new Error('Codon Crush tutorial requires a certified swap');
    const match=frame.matched;
    const swapped={...start,board:frame.swapped};
    const steps:Step[] = [
      step('Read the next codon','Collect the target three-base codons in order. Find two adjacent tiles whose swap would form the next codon.',start,start,[a,b],undefined,undefined,s.CRUSH_TARGETS[0]),
      {...step('Swap neighbours','Drag one tile into its neighbour, or tap the two tiles. Watch both tiles trade places. A wrong swap returns to its starting position.',start,swapped,[a,b],[a,b],undefined,s.CRUSH_TARGETS[0]),crush:{phase:'swap',a,b,frame}},
      {...step('Clear and refill','The three matching bases shrink and disappear. Existing bases fall down and new bases refill the gaps. If the next target codon is already on the board it clears automatically, creating a chain reaction! Each whole chain counts as one move.',swapped,{...result.state,board:frame.board},[...match],undefined,undefined,s.CRUSH_TARGETS[0]),crush:{phase:'settle',a,b,frame}},
    ];
    const chain=result.crushFrames?.[1];
    if(chain) {
      const before={...start,board:chain.swapped}, after={...result.state,board:chain.board};
      steps.push({...step('Chain reaction!','The next required codon is already here, so it clears without another swipe. Watch the tiles fall again. The chain continues until the next target is missing or the round is complete.',before,after,[...chain.matched],undefined,undefined,chain.matched.map(c=>chain.swapped[c]).join('')),crush:{phase:'settle',a,b,frame:chain}});
    }
    return steps;
  }
  if (mechanic === 'assembly') {
    const read=1, offset=s.READ_STARTS[read]!, src=s.READ_CELLS[read]!, dest=s.ASSEMBLY_CELLS[offset]!;
    const first=run(start,[{type:'place',read,offset}]), end=run(start,s.READ_STARTS.map((offset,read)=>({type:'place',read,offset})));
    return [
      step('Read the reference','The target is the complete reference fragment. Each read is a short, overlapping piece of that sequence.',start,start,[...src],undefined,undefined,s.ASSEMBLY_TARGET),
      step('Place a read','Tap or drag a read into the numbered assembly row. Its first base goes in the chosen slot.',start,first,[...src,dest],[src[0]!,dest],undefined,s.ASSEMBLY_TARGET),
      step('Overlap the reads','Place all three reads so overlapping letters agree and the assembled row exactly matches the reference.',first,end,[...s.ASSEMBLY_CELLS],undefined,undefined,s.ASSEMBLY_TARGET),
    ];
  }
  if (mechanic === 'mutation') {
    const c=s.MUTATIONS[0]!, want=mutationExpected(c,s)!;
    const end=run(start,[{type:'edit',cell:c,base:want}]);
    return [
      step('Compare the target','Each upper strand is the reference. The numbered target rows show the complementary strand you must repair: A pairs with T, C with G.',start,start,[c-9,c],undefined,undefined,want),
      step('Select the mismatch','Red outlines mark incorrect bases. Tap the lower-strand tile you want to repair.',start,start,[c],[c,c],undefined,want),
      step('Slide a replacement into place','Tap the correct coloured base in the vertical column on the right of the board. It slides into the selected square. Green underlines mark correct bases; repair every mismatch to finish.',start,end,[c],[c,c],undefined,want),
    ];
  }
  if (mechanic === 'connections') {
    const p=s.CONNECTION_ROUTES[0]!, pair=s.CONNECTION_PAIRS[0]!;
    const first=run(start,[{type:'route',pair:0,cell:p[0]!}]), done=run(first,p.slice(1).map(cell=>({type:'route',pair:0,cell})));
    return [
      step('Find matching endpoints','Each numbered coloured pair represents a coding fragment and its reverse complement. Start at the 5′ endpoint.',start,first,[pair.start,pair.end],[pair.start,pair.start],undefined,pair.seq),
      step('Draw a path','Drag across neighbouring empty squares to the endpoint with the same number and colour. Paths cannot cross or pass through holes.',first,done,[...p],[p[0]!,p.at(-1)!],[...p],pair.seq),
      step('Connect every pair','Repeat for the other two pairs. Tap a start again to redraw its path, or use Undo.',done,run(start,s.CONNECTION_ROUTES.flatMap((route,pair)=>route.map(cell=>({type:'route',pair,cell})))),s.CONNECTION_ROUTES.flatMap(r=>[...r]),undefined,[...p],pair.seq),
    ];
  }
  const [a,b]=s.CUT_SOLUTION, first=run(start,[{type:'cut',cell:a!}]), end=run(first,[{type:'cut',cell:b!}]);
  return [
    step('Locate the target fragment','Read the coloured target sequence and find the matching stretch on the long DNA strand. The short strand is a decoy.',start,start,[...s.CUT_STRANDS[0]!],undefined,undefined,s.CUT_TARGET),
    {...step('Make the first cut',s.enzyme==='BsaI'?'BsaI cuts outside its GGTCTC recognition motif. Tap the marked bond immediately before the target. Synthetic adapters are not coding DNA.':'HaeIII cuts GG|CC. Tap the scissors at the first boundary of the target.',start,first,[a!],[a!,a!],undefined,s.CUT_TARGET),cut:[a!]},
    {...step('Isolate the fragment','Make the second cut just after the target. Only the exact fragment is collected; leave the decoy untouched. Undo a wrong cut.',first,end,[b!],[b!,b!],undefined,s.CUT_TARGET),cut:[a!,b!]},
  ];
}
const xy=(c:number):[number,number]=>[c%9+.5,Math.floor(c/9)+.5];
const points=(p:readonly number[])=>p.map(c=>xy(c).join(',')).join(' ');
/** One opaque, clipped strip moves as a unit, with a duplicate at each end for wrapping.
 * The stationary board is never faded or animated. */
function SlideTutorialBoard({ item, index, reducedMotion }: { item: Step; index: number; reducedMotion: boolean }) {
  const motion = item.motion;
  const moving = !!motion && !reducedMotion;
  const board = reducedMotion || index === 2 ? item.after : item.before;
  const cells = motion?.cells ?? [];
  const n = cells.length;
  const start = cells[0] ?? 0, end = cells.at(-1) ?? 0;
  const axis = motion?.axis ?? 'col';
  const stripStyle = {
    gridColumn: axis === 'col' ? (start % 9 + 1) + ' / span 1' : (start % 9 + 1) + ' / ' + (end % 9 + 2),
    gridRow: axis === 'col' ? (Math.floor(start / 9) + 1) + ' / ' + (Math.floor(end / 9) + 2) : (Math.floor(start / 9) + 1) + ' / span 1',
    '--slide-demo-shift': 'calc(' + ((motion?.steps ?? 0) * 100 / Math.max(1,n)) + '% + ' + ((motion?.steps ?? 0) / Math.max(1,n)) + 'px)',
  } as CSSProperties;
  const from = item.cursor ? xy(item.cursor[0]) : null, to = item.cursor ? xy(item.cursor[1]) : null;
  return <>
    {board.map((b,c)=>{
      const track=item.tracks?.find(t=>t.cells.includes(c));
      const gap=item.repair?.cell===c;
      const restored=gap&&index===2;
      const base=restored?item.repair!.expected:b;
      return <div key={c} className={'tutorial-cell'+(base==='.'?' hole':'')+(item.cells.includes(c)||track||gap?' highlighted':'')+(gap?' tutorial-repair-gap':'')} data-demo-cell={c} data-base={base} data-tutorial-group={track?.group} data-repair-gap={gap?'true':undefined}>
        {base!=='.' ? <span className={'tutorial-slide-static b-'+base}>{base}</span> : gap ? <span className="tutorial-gap-mark">?</span> : null}
        {track && track.cells[0]===c && item.tracks!.length>1 && <small className="tutorial-group-mark">{track.group}</small>}
      </div>;
    })}
    {moving && <div className={'tutorial-slide-clip '+axis} style={stripStyle} data-testid="tutorial-slide-column" data-segment={cells.join(',')}>
      <div className="tutorial-slide-strip" data-testid="tutorial-slide-strip">
        {Array.from({length:n+2},(_,k)=>{
          const i=k-1, source=cells[((i%n)+n)%n]!, b=item.before[source]!;
          const position='calc('+(i*100/n)+'% + '+(i/n)+'px)';
          const size='calc('+(100/n)+'% - '+((n-1)/n)+'px)';
          const style:CSSProperties=axis==='col'?{top:position,height:size,left:0,right:0}:{left:position,width:size,top:0,bottom:0};
          return <span key={i} className={'tutorial-slide-tile b-'+b} style={style} data-source-cell={source} data-wrap={i<0||i>=n?'true':'false'}>{b}</span>;
        })}
      </div>
    </div>}
    {moving && from && to && <span className="tutorial-slide-finger" aria-hidden="true" style={{'--fx':from[0]/9*100+'%','--fy':from[1]/9*100+'%','--tx':to[0]/9*100+'%','--ty':to[1]/9*100+'%'} as CSSProperties}>☝</span>}
  </>;
}

/** Use the engine's exact swap, match and gravity metadata. Each existing
 * tile occupies its real source and destination; no crossfade of the board. */
function CrushTutorialBoard({item,reducedMotion,spec,def}:{item:Step;reducedMotion:boolean;spec:LabSpec;def?:import('../engine/types.ts').LevelDefinition|undefined}) {
  const demo=item.crush;
  const phase=reducedMotion?undefined:demo?.phase;
  const board=reducedMotion?item.after:item.before;
  const falls=new Map(phase==='settle'?demo!.frame.falls.map(f=>[f.to,f]):[]);
  return <>
    {board.map((b,c)=>{
      const hole=b==='.';
      const swap=phase==='swap'&&(c===demo!.a||c===demo!.b);
      const match=phase==='settle'&&demo!.frame.matched.includes(c);
      const fall=falls.get(c);
      // A fall is rendered once at its destination, translated back to its
      // original cell until the match has cleared. Stationary tiles stay opaque.
      const base=phase==='settle'?item.after[c]!:b;
      const to=swap?(c===demo!.a?demo!.b:demo!.a):c;
      const dx=to%9-c%9,dy=Math.floor(to/9)-Math.floor(c/9);
      const style=swap?{'--demo-swap-x':'calc('+(dx*100)+'% + '+dx+'px)','--demo-swap-y':'calc('+(dy*100)+'% + '+dy+'px)'} as CSSProperties:fall?{'--fall-rows':fall.rows} as CSSProperties:undefined;
      const classes=['tutorial-crush-tile',spec.tokens?.[base]?'lab-token tok '+tierClass(labDecode(spec,base).length):'b-'+base,swap?'tutorial-crush-swap':'',fall?'tutorial-crush-fall':'',fall?.from===null?'tutorial-crush-new':'',!phase&&item.cells.includes(c)?'tutorial-crush-highlight':''].filter(Boolean).join(' ');
      return <div key={c} className={'tutorial-cell'+(hole?' hole':'')} data-demo-cell={c} data-base={base}>
        {!hole&&<span className={classes} style={{...style,...(def&&spec.tokens?tokenStyle({...def,tokens:spec.tokens},base):{})}} data-testid={swap?'tutorial-crush-swap':fall?'tutorial-crush-fall':undefined} data-source={fall?fall.from??'new':c} data-destination={to} data-base={base}>{spec.tokens?.[base]?<TokenFace seq={labDecode(spec,base)} label={labLabel(spec,base)}/>:base}</span>}
        {match&&<span className={'tutorial-crush-clear '+(spec.tokens?.[b]?'lab-token tok '+tierClass(labDecode(spec,b).length):'b-'+b)} style={def&&spec.tokens?tokenStyle({...def,tokens:spec.tokens},b):undefined} data-testid="tutorial-crush-clear" data-base={b}>{spec.tokens?.[b]?<TokenFace seq={labDecode(spec,b)} label={labLabel(spec,b)}/>:b}</span>}
      </div>;
    })}
    {phase==='swap'&&<span className="tutorial-finger" aria-hidden="true" style={{'--fx':xy(demo!.a)[0]/9*100+'%','--fy':xy(demo!.a)[1]/9*100+'%','--tx':xy(demo!.b)[0]/9*100+'%','--ty':xy(demo!.b)[1]/9*100+'%'} as CSSProperties}>☝</span>}
  </>;
}

export function MechanicTutorial({ mechanic, stage, reducedMotion, onClose }: { mechanic:TutorialId; stage:MixedStage|null; reducedMotion:boolean; onClose:()=>void }) {
  const [index,setIndex]=useState(0);
  const [replay,setReplay]=useState(0);
  const steps=demonstration(mechanic,stage);
  const spec=stage?.spec??DEFAULT_LAB_SPEC;
  const def=stage?ALL_LEVELS.find(l=>l.id===stage.id):undefined;
  const face=(b:string)=>spec.tokens?.[b]?<TokenFace seq={labDecode(spec,b)} label={labLabel(spec,b)}/>:b==='.'||b==='·'?'':b;
  const cls=(b:string)=>spec.tokens?.[b]?'lab-token tok '+tierClass(labDecode(spec,b).length):'b-'+b;
  const style=(b:string)=>def&&spec.tokens?tokenStyle({...def,tokens:spec.tokens},b):undefined;
  const item=steps[index]!;
  const sliding=isSlidingTutorial(mechanic);
  const title=sliding?MODE_LABEL[slideMode[mechanic]]:LAB_META[mechanic].title;
  const move = (i:number) => {setIndex(i);setReplay(0);};
  const onKey=(e:KeyboardEvent<HTMLDivElement>)=>{
    if(e.key==='Escape'){e.preventDefault();onClose();}
    if(e.key==='Tab'){
      const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      const first=buttons[0],last=buttons.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    }
  };
  const cursor=item.cursor;
  const from=cursor?xy(cursor[0]):null,to=cursor?xy(cursor[1]):null;
  const exampleCell=spec.MUTATIONS[0]??-1;
  const exampleBase=mechanic==='mutation'?mutationExpected(exampleCell,spec):null;
  const railOptions=mechanic==='mutation'?labReplacementOptions(spec,exampleCell):[];
  const railIndex=exampleBase===null?-1:railOptions.indexOf(exampleBase);
  const railPosition=railIndex<0?-1:MUTATION_RAIL_CELLS[railIndex]!;
  const railFrom=railPosition<0?null:xy(railPosition);
  const railTo=exampleCell<0?null:xy(exampleCell);
  return <div className="overlay tutorial-overlay" role="dialog" aria-modal="true" aria-labelledby="tutorial-title" data-testid="mechanic-tutorial" data-mechanic={mechanic} onKeyDown={onKey}>
    <div className="card tutorial-card">
      <div className="row-between"><span className="muted small">FIRST-USE GUIDE · {index+1}/{steps.length}</span><button type="button" onClick={onClose} autoFocus data-testid="tutorial-skip">Skip</button></div>
      <h3 id="tutorial-title">{title}</h3>
      <h4>{item.title}</h4><p className="small">{spec.tokens?item.text.replace(/letters/g,'blocks').replace(/letter/g,'block').replace(/three-base codons/g,'three-block sequences').replace(/target base/g,'target block').replace(/replacement base/g,'replacement block'):item.text}</p>
      {item.target && <div className="tutorial-target" aria-label="Example target">{[...item.target].map((b,i)=><span key={i} className={cls(b)} style={style(b)} title={labDecode(spec,b)}>{face(b)}</span>)}</div>}
      {item.tracks && item.tracks.length>1 && <div className="tutorial-tracks" aria-label="Example targets">{item.tracks.map(t=><div className="tutorial-target tutorial-track" key={t.group} data-tutorial-group={t.group}><b>{t.group}{mechanic==='slide-replicate' ? (t.strand==='coding'?' · 5′→3′':' · 3′→5′') : ''}</b>{[...t.expected].map((b,i)=><span key={i} className={'b-'+b}>{b}</span>)}</div>)}</div>}
      <div className={'tutorial-board'+(reducedMotion?' static':'')+(sliding?' slide-demo':mechanic==='crush'?' crush-demo':mechanic==='mutation'?' mutation-demo':'')} key={index+':'+replay} data-testid="tutorial-board" data-step={index+1}>
        {sliding ? <SlideTutorialBoard item={item} index={index} reducedMotion={reducedMotion} /> : mechanic==='crush' ? <CrushTutorialBoard item={item} reducedMotion={reducedMotion} spec={spec} def={def} /> : <>
        {item.before.map((b,c)=>{
          const mutationRailIndex=mechanic==='mutation'?MUTATION_RAIL_CELLS.indexOf(c as typeof MUTATION_RAIL_CELLS[number]):-1;
          if(mutationRailIndex>=0 && railOptions[mutationRailIndex]!==undefined){
            const candidate=railOptions[mutationRailIndex]!;
            return <div key={c} className="tutorial-cell tutorial-mutation-rail tutorial-mutation-rail-slot" data-demo-cell={c} data-testid="tutorial-mutation-rail">
              <span className={'tutorial-base tutorial-mutation-option '+cls(candidate)+(index===2&&candidate===exampleBase?' tutorial-mutation-choice':'')}
                style={style(candidate)} data-base-option={candidate}>{face(candidate)}</span>
            </div>;
          }
          const after=item.after[c]!;
          const changed=b!==after && !reducedMotion;
          const shown=reducedMotion?after:b;
          return <div key={c} className={'tutorial-cell'+(shown==='.'?' hole':'')+(item.cells.includes(c)?' highlighted':'')+(mechanic==='mutation'&&c%9===8?' tutorial-mutation-rail-slot':'')} data-demo-cell={c}>
            <span className={'tutorial-base '+cls(shown)} style={style(shown)}>{face(shown)}</span>
            {changed && <span className={'tutorial-change '+cls(after)+(mechanic==='mutation'?' tutorial-mutation-correct':'')} style={style(after)}>{face(after)}</span>}
          </div>;
        })}
        {mechanic==='mutation' && index===2 && railFrom && railTo && exampleBase && !reducedMotion && <span
          className={'tutorial-mutation-flight '+cls(exampleBase)} data-testid="tutorial-mutation-flight" style={{
            ...style(exampleBase),
            '--fx':railFrom[0]/9*100+'%', '--fy':railFrom[1]/9*100+'%',
            '--tx':railTo[0]/9*100+'%', '--ty':railTo[1]/9*100+'%'
          } as CSSProperties}>{face(exampleBase)}</span>}
        {(item.path || item.pathBefore) && <svg viewBox="0 0 9 9" className="tutorial-path" aria-hidden="true">{item.pathBefore && <polyline className="tutorial-starter-path" points={points(item.pathBefore)} pathLength="1" />}{item.path && <polyline className="tutorial-extension-path" points={points(item.path)} pathLength="1" />}</svg>}
        {item.cut?.map(c=><span key={c} className="tutorial-cut" style={{left:(c%9+.5)/9*100+'%',top:(Math.floor(c/9)+.5)/9*100+'%'}}>✂</span>)}
        {from&&to&&<span className="tutorial-finger" aria-hidden="true" style={{'--fx':from[0]/9*100+'%','--fy':from[1]/9*100+'%','--tx':to[0]/9*100+'%','--ty':to[1]/9*100+'%'} as CSSProperties}>☝</span>}
        </>}
      </div>
      <div className="tutorial-actions"><button type="button" onClick={()=>move(index-1)} disabled={index===0}>Back</button><button type="button" onClick={()=>setReplay(n=>n+1)}>Replay animation</button><button type="button" className="primary" data-testid="tutorial-next" onClick={()=>index===steps.length-1?onClose():move(index+1)}>{index===steps.length-1?'Play':'Next step →'}</button></div>
    </div>
  </div>;
}

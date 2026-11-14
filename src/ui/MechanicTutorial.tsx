import { useState, type CSSProperties, type KeyboardEvent } from 'react';
import { ALL_LEVELS } from '../campaign/campaign.ts';
import { type Mechanic, type MixedStage } from '../campaign/mixed.ts';
import { applySlide, segmentCells } from '../engine/grid.ts';
import { applyLab, createLab, DEFAULT_LAB_SPEC, LAB_META, mutationExpected, type LabAction, type LabState } from '../engine/mechanicsLab.ts';

type Step = { title: string; text: string; before: string[]; after: string[]; cells: number[]; path?: number[]; cursor?: [number, number]; cut?: number[]; target?: string; motion?: { cells: number[]; axis: 'row' | 'col'; steps: number } };
const run = (state: LabState, actions: readonly LabAction[]) => actions.reduce((s,a) => applyLab(s,a).state,state);
const step = (title: string, text: string, before: LabState, after: LabState, cells: number[], cursor?: [number,number], path?: number[], target?: string): Step => ({title,text,before:before.board,after:after.board,cells,...(cursor ? {cursor} : {}),...(path ? {path} : {}),...(target ? {target} : {})});
function demonstration(mechanic: Mechanic, stage: MixedStage | null): Step[] {
  if (mechanic === 'slide') {
    const def = ALL_LEVELS.find(l => l.id === 'ins-01')!;
    const move = def.certificateSlides[0]!;
    const cells = segmentCells(def.mask,move.origin,move.axis);
    const i = Math.floor(cells.length / 2);
    const origin = cells[i]!;
    const end = cells[i + move.steps]!;
    const after = applySlide(def.mask,def.initial,move.origin,move.axis,move.steps).board;
    const target = def.tracks[0]!.expected;
    return [
      {title:'Read the target',text:'Build the DNA shown in the clue. The marked cells must spell the sequence in order.',before:[...def.initial],after:[...def.initial],cells:def.tracks[0]!.cells,target},
      {title:'Slide the whole column',text:'Swipe up one square. Every tile in the column segment moves together; the top tile wraps to the bottom. Holes stop a segment. Horizontal swipes move rows in the same way.',before:[...def.initial],after:[...after],cells,cursor:[origin,end],target,motion:{cells,axis:move.axis,steps:move.steps}},
      {title:'Match all clues',text:'Keep sliding until every target base is in its marked slot. Undo reverses a move; Hint shows the next recovery move.',before:[...after],after:[...def.solved],cells:def.tracks[0]!.cells,target},
    ];
  }
  const s = stage?.mechanic === mechanic ? stage.spec : DEFAULT_LAB_SPEC;
  const start = createLab(mechanic,s);
  if (mechanic === 'trace') {
    const p=s.TRACE_PATH, a=p[0]!, b=p[1]!, c=p[2]!;
    const first=run(start,[{type:'trace',cell:a}]), next=run(first,[{type:'trace',cell:b},{type:'trace',cell:c}]);
    return [
      step('Find the first base','Look at the target sequence. Start on a tile with its first letter.',start,first,[a],[a,a], [a],s.TRACE_TARGET),
      step('Trace in order','Drag through neighbouring tiles matching the next letters. No diagonals, holes or reused cells.',first,next,[a,b,c],[a,c],[a,b,c],s.TRACE_TARGET),
      step('Finish the strand','Continue until every target base has been traced. Lift your finger and continue with taps if needed; Undo backtracks.',next,run(start,p.map(cell=>({type:'trace',cell}))),[...p],undefined,[...p],s.TRACE_TARGET),
    ];
  }
  if (mechanic === 'crush') {
    const [a,b]=s.CRUSH_SWAPS[0]!, action:LabAction={type:'swap',a,b};
    const result=applyLab(start,action), frame=result.crush;
    const match=frame?.matched ?? [a-2,a-1,a];
    const swapped=frame ? {...start,board:frame.swapped} : start;
    return [
      step('Read the next codon','Collect the target three-base codons in order. Find two adjacent tiles whose swap would form the next codon.',start,start,[a,b],undefined,undefined,s.CRUSH_TARGETS[0]),
      step('Swap neighbours','Drag one tile into its neighbour, or tap the two tiles. A wrong swap returns to its starting position.',start,swapped,[a,b],[a,b],undefined,s.CRUSH_TARGETS[0]),
      step('Clear and refill','The matched three bases disappear, and tiles fall into the gaps. Collect the remaining codons to assemble the fragment.',swapped,result.state,[...match],undefined,undefined,s.CRUSH_TARGETS[0]),
    ];
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
      step('Choose the correct base','Tap the replacement letter below the board. Green underlines mark correct bases. Repair every mismatch to finish.',start,end,[c],[c,c],undefined,want),
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
    {board.map((b,c)=><div key={c} className={'tutorial-cell'+(b==='.'?' hole':'')+(item.cells.includes(c)?' highlighted':'')} data-demo-cell={c} data-base={b}>
      {b!=='.' && <span className={'tutorial-slide-static b-'+b}>{b}</span>}
    </div>)}
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

export function MechanicTutorial({ mechanic, stage, reducedMotion, onClose }: { mechanic:Mechanic; stage:MixedStage|null; reducedMotion:boolean; onClose:()=>void }) {
  const [index,setIndex]=useState(0);
  const [replay,setReplay]=useState(0);
  const steps=demonstration(mechanic,stage);
  const item=steps[index]!;
  const title=mechanic==='slide'?'Sliding tiles':LAB_META[mechanic].title;
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
  const motionStyle=(c:number):CSSProperties|undefined=>{
    const m=item.motion;if(!m||!m.cells.includes(c))return undefined;
    const i=m.cells.indexOf(c), dest=m.cells[((i+m.steps)%m.cells.length+m.cells.length)%m.cells.length]!;
    return {'--demo-dx':(dest%9-c%9)*100+'%','--demo-dy':(Math.floor(dest/9)-Math.floor(c/9))*100+'%'} as CSSProperties;
  };
  return <div className="overlay tutorial-overlay" role="dialog" aria-modal="true" aria-labelledby="tutorial-title" data-testid="mechanic-tutorial" data-mechanic={mechanic} onKeyDown={onKey}>
    <div className="card tutorial-card">
      <div className="row-between"><span className="muted small">FIRST-USE GUIDE · {index+1}/{steps.length}</span><button type="button" onClick={onClose} autoFocus data-testid="tutorial-skip">Skip</button></div>
      <h3 id="tutorial-title">{title}</h3>
      <h4>{item.title}</h4><p className="small">{item.text}</p>
      {item.target && <div className="tutorial-target" aria-label="Example target">{[...item.target].map((b,i)=><span key={i} className={'b-'+b}>{b}</span>)}</div>}
      <div className={'tutorial-board'+(reducedMotion?' static':'')+(mechanic==='slide'?' slide-demo':'')} key={index+':'+replay} data-testid="tutorial-board" data-step={index+1}>
        {mechanic==='slide' ? <SlideTutorialBoard item={item} index={index} reducedMotion={reducedMotion} /> : <>
        {item.before.map((b,c)=><div key={c} className={'tutorial-cell'+(b==='.'?' hole':'')+(item.cells.includes(c)?' highlighted':'')}>
          <span className={'tutorial-before b-'+b} style={motionStyle(c)}>{b==='.'||b==='·'?'':b}</span>
          <span className={'tutorial-after b-'+item.after[c]}>{item.after[c]==='.'||item.after[c]==='·'?'':item.after[c]}</span>
        </div>)}
        {item.path && <svg viewBox="0 0 9 9" className="tutorial-path" aria-hidden="true"><polyline points={points(item.path)} pathLength="1" /></svg>}
        {item.cut?.map(c=><span key={c} className="tutorial-cut" style={{left:(c%9+.5)/9*100+'%',top:(Math.floor(c/9)+.5)/9*100+'%'}}>✂</span>)}
        {from&&to&&<span className="tutorial-finger" aria-hidden="true" style={{'--fx':from[0]/9*100+'%','--fy':from[1]/9*100+'%','--tx':to[0]/9*100+'%','--ty':to[1]/9*100+'%'} as CSSProperties}>☝</span>}
        </>}
      </div>
      <div className="tutorial-actions"><button type="button" onClick={()=>move(index-1)} disabled={index===0}>Back</button><button type="button" onClick={()=>setReplay(n=>n+1)}>Replay animation</button><button type="button" className="primary" data-testid="tutorial-next" onClick={()=>index===steps.length-1?onClose():move(index+1)}>{index===steps.length-1?'Play':'Next step →'}</button></div>
    </div>
  </div>;
}

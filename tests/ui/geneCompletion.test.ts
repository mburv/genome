import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {CAMPAIGN_GENES,runOf} from '../../src/campaign/campaign.ts';
import {mixedStage} from '../../src/campaign/mixed.ts';
import {GENES} from '../../src/genomics/genes.ts';
import {WinCard} from '../../src/ui/WinCard.tsx';

describe('every campaign gene ending',()=>{
  for(const symbol of CAMPAIGN_GENES){
    it(symbol+' always offers its card on a final-level replay, even with incomplete reference coverage',()=>{
      const run=runOf(symbol),def=run.at(-1)!,stage=mixedStage(def);
      const render=(assembled:boolean)=>renderToStaticMarkup(createElement(WinCard,{
        def,moves:1,powersUsed:0,newBases:0,replayed:true,assembled,assembledBases:assembled?GENES[symbol]!.cdsLength:0,
        cdsLength:GENES[symbol]!.cdsLength,reducedMotion:true,hasNext:true,
        ...(stage?{mechanic:{title:'Fragment complete',sequence:stage.sequence,practice:false,range:{start:stage.start,end:stage.end}}}:{}),
        onNext:()=>{},onMap:()=>{},onCard:()=>{},onClose:()=>{},
      }));
      const partial=render(false),full=render(true);
      expect(partial).toContain('View card');
      expect(partial).toContain('Replay · no new bases');
      expect(partial).not.toContain('data-testid="assembled"');
      expect(full).toContain('View card');
      expect(full).toContain('data-testid="assembled"');
    });
  }
});

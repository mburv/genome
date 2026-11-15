import { GENOME_BASES, bonusUnlocked } from '../campaign/bonus.ts';
import type { LevelDefinition } from '../engine/types.ts';
import { GENES, MANIFEST } from '../genomics/genes.ts';
import { CAMPAIGN_GENES, CAMPAIGN_LEVELS, isDiscovered, runOf, runProgress } from '../campaign/campaign.ts';
import { assemblyStatus } from '../campaign/assembly.ts';
import { GENE_FUNCTIONS } from '../genomics/functionDescriptions.ts';
import { mechanicOf } from '../campaign/mixed.ts';
import { LAB_META } from '../engine/mechanicsLab.ts';
import { MODE_LABEL } from './modes.ts';

interface Props {
  completed: readonly string[];
  historicalCompleted?:readonly string[];
  attempted: readonly string[];
  currentLevelId: string;
  legacyM1: readonly string[];
  onPlay: (levelId: string) => void;
  onMechanics: () => void;
  onBonus: () => void;
  onCard: (symbol: string) => void;
}

export function MapScreen({ completed, historicalCompleted=[], attempted, currentLevelId, onPlay, onMechanics, onBonus, onCard, legacyM1 }: Props) {
  const progressed=[...completed,...historicalCompleted];
  const nextUnfinished = CAMPAIGN_LEVELS.find((l) => !progressed.includes(l.id));
  const next = nextUnfinished ?? CAMPAIGN_LEVELS[0]!;
  const nextRun = runProgress(next)!;
  const catalogue = CAMPAIGN_GENES.map((symbol) => MANIFEST.included.find((g) => g.symbol === symbol)!);
  return (
    <section className="map" aria-label="Level map" data-testid="level-map">
      <button type="button" className="primary big" onClick={() => onPlay(next.id)} data-testid="continue">
        {completed.length === 0 ? 'Start' : !nextUnfinished ? 'Replay' : 'Continue'} · {next.symbol} {nextRun.part}/{nextRun.of}
      </button>
      <div className="panel catalogue" data-testid="catalogue">
        <h2 className="gene">Gene catalogue</h2>
        {catalogue.map((m) => {
              const gene = GENES[m.symbol]!;
              const run = runOf(m.symbol);
              const st = assemblyStatus(completed, gene);
              const disc = isDiscovered(progressed, m.symbol);
              const node = (l: LevelDefinition) => {
                const done = progressed.includes(l.id);
                const part = runProgress(l)!.part;
                const mechanic = mechanicOf(l);
                const historical=historicalCompleted.includes(l.id);
                const label = mechanic === 'slide' ? MODE_LABEL[l.mode] : LAB_META[mechanic].title;
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      className={`cnode ${l.chapter ? '' : 'intro '} ${done ? 'done' : ''} ${l.id === currentLevelId ? 'current' : ''} ${attempted.includes(l.id) && !done ? 'started' : ''}`.replace(/  +/g, ' ').trim()}
                      onClick={() => onPlay(l.id)}
                      aria-label={`${m.symbol} ${part} of ${run.length}: ${label}, ${mechanic === 'slide' ? l.chapter ? `${l.tier}-base tiles` : '1-base tiles' : `${l.tier??1}-base tiles · mixed mechanic`}${historical ? ', previously completed; remaining reference bases in Human Genome' : done ? ', complete' : ''}`}
                      data-testid={`cnode-${l.id}`}
                    >
                      <span className="node-number">{part}</span>{done && <span className="node-check" aria-hidden="true">✓</span>}
                    </button>
                  </li>
                );
              };
              return (
                <div key={m.symbol} className={`cat-gene ${st.verified ? 'assembled' : ''}`} data-testid={`cat-${m.symbol}`}>
                  <div className="row-between">
                    <button type="button" className="cat-name" onClick={() => onCard(m.symbol)} data-testid={`cat-card-${m.symbol}`}>
                      <b>{m.symbol}</b> <span className="muted small">{m.name}</span>
                    </button>
                    <span className={`cat-state ${st.verified ? 'ok' : ''}`}>{st.verified ? '🧬 Assembled' : disc ? 'Discovered' : 'New'}</span>
                  </div>
                  <div className="progress thin" role="progressbar" aria-label={`${m.symbol} coding bases assembled`} aria-valuemin={0} aria-valuemax={m.cdsLength} aria-valuenow={st.covered}>
                    <i style={{ width: `${(100 * st.covered) / m.cdsLength}%` }} />
                  </div>
                  <div className="row-between muted tiny">
                    <span data-testid={`cat-progress-${m.symbol}`}>{st.covered} / {m.cdsLength} bp · {GENE_FUNCTIONS[m.symbol] ?? gene.functionSummary}</span>
                  </div>
                  <ol className="chapter-nodes" aria-label={`${m.symbol} puzzles`} data-testid={`run-nodes-${m.symbol}`}>
                    {run.map(node)}
                  </ol>
                </div>
              );
        })}
        {MANIFEST.excluded.length > 0 && (
          <details className="excluded small" data-testid="catalogue-excluded">
            <summary>{MANIFEST.excluded.length} candidate{MANIFEST.excluded.length > 1 ? 's' : ''} not included</summary>
            <ul>{MANIFEST.excluded.map((e) => <li key={e.symbol}><b>{e.symbol}</b>: {e.reason}</li>)}</ul>
          </details>
        )}
      </div>
      {legacyM1.length > 0 && (
        <p className="muted small legacy" data-testid="legacy-m1">M1 history: you completed prototype level{legacyM1.length > 1 ? 's' : ''} {legacyM1.map((id) => Number(id.slice(-2))).join(', ')}. The prototype challenges are kept here as history only.</p>
      )}
      {historicalCompleted.length>0&&<p className="muted small">Your earlier Famous Genes completions are preserved. Any changed reference bases remain available in Human Genome.</p>}
      <button type="button" className="big" onClick={onMechanics} data-testid="open-mechanics">Mechanics Lab · 6 practice puzzles →</button>
      <button type="button" className="big" data-testid="open-bonus" disabled={!bonusUnlocked(progressed)} onClick={onBonus}>Human Genome · {bonusUnlocked(progressed)?'Bonus genes →':'Locked until main campaign complete'}</button>
      <p className="muted tiny">{GENOME_BASES.toLocaleString()} reference DNA bases · shared reference progress; Famous Genes bases carry forward.</p>
    </section>
  );
}

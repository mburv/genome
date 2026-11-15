import { BONUS_PACK, bonusUnlocked } from '../campaign/bonus.ts';
import type { LevelDefinition } from '../engine/types.ts';
import { GENES, MANIFEST } from '../genomics/genes.ts';
import { CAMPAIGN_GENES, CAMPAIGN_LEVELS, introOf, isDiscovered, runOf, runProgress } from '../campaign/campaign.ts';
import { assemblyStatus } from '../campaign/assembly.ts';
import { tierName } from '../campaign/chapters.ts';
import { mechanicOf } from '../campaign/mixed.ts';
import { LAB_META } from '../engine/mechanicsLab.ts';
import { MODE_LABEL } from './modes.ts';
import { POWER_BLURB, POWER_ICON, POWER_LABEL } from './PowerTray.tsx';
import { POWER_COST } from '../engine/powers.ts';

interface Props {
  labs: readonly LevelDefinition[];
  completed: readonly string[];
  attempted: readonly string[];
  currentLevelId: string;
  legacyM1: readonly string[];
  onPlay: (levelId: string) => void;
  onMechanics: () => void;
  onBonus: () => void;
  onCard: (symbol: string) => void;
}

export function MapScreen({ labs, completed, attempted, currentLevelId, onPlay, onMechanics, onBonus, onCard, legacyM1 }: Props) {
  const nextUnfinished = CAMPAIGN_LEVELS.find((l) => !completed.includes(l.id));
  const next = nextUnfinished ?? CAMPAIGN_LEVELS[0]!;
  const nextRun = runProgress(next)!;
  const catalogue = CAMPAIGN_GENES.map((symbol) => MANIFEST.included.find((g) => g.symbol === symbol)!);
  return (
    <section className="map" aria-label="Level map" data-testid="level-map">
      <button type="button" className="primary big" onClick={() => onPlay(next.id)} data-testid="continue">
        {completed.length === 0 ? 'Start' : !nextUnfinished ? 'Replay' : 'Continue'} · {next.symbol} {nextRun.part}/{nextRun.of}
      </button>
      <button type="button" className="big" onClick={onMechanics} data-testid="open-mechanics">Mechanics Lab · 6 new puzzles →</button>
      <p className="muted small">Famous Genes · main campaign</p>
      <button type="button" className="big" data-testid="open-bonus" disabled={!bonusUnlocked(completed)} onClick={onBonus}>Human Genome · {bonusUnlocked(completed)?'Bonus genes →':'Locked until main campaign complete'}</button>
      <p className="muted tiny">{BONUS_PACK.genes.length?BONUS_PACK.genes.length.toLocaleString()+' additional annotated genes':'Bonus reference catalogue'} · separate post-campaign progress.</p>
      <div className="panel catalogue" data-testid="catalogue">
        <h2 className="gene">Gene catalogue</h2>
        {catalogue.map((m) => {
              const gene = GENES[m.symbol]!;
              const intros = introOf(m.symbol);
              const run = runOf(m.symbol);
              const st = assemblyStatus(completed, gene);
              const disc = isDiscovered(completed, m.symbol);
              const chapters = run.filter((l) => l.chapter);
              const tiers = [
                ...(intros.length ? ['1-base tiles'] : []),
                ...[...new Set(chapters.map((l) => l.tier!))].sort((a, b) => a - b).map(tierName),
              ];
              const countLabel = `${run.length} stages · ${new Set(run.map(mechanicOf)).size} mechanics`;
              const node = (l: LevelDefinition) => {
                const done = completed.includes(l.id);
                const part = runProgress(l)!.part;
                const mechanic = mechanicOf(l);
                const label = mechanic === 'slide' ? MODE_LABEL[l.mode] : LAB_META[mechanic].title;
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      className={`cnode ${l.chapter ? '' : 'intro '} ${done ? 'done' : ''} ${l.id === currentLevelId ? 'current' : ''} ${attempted.includes(l.id) && !done ? 'started' : ''}`.replace(/  +/g, ' ').trim()}
                      onClick={() => onPlay(l.id)}
                      aria-label={`${m.symbol} ${part} of ${run.length}: ${label}, ${mechanic === 'slide' ? l.chapter ? `${l.tier}-base tiles` : '1-base tiles' : `${l.tier??1}-base tiles · mixed mechanic`}${done ? ', complete' : ''}`}
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
                    <span data-testid={`cat-progress-${m.symbol}`}>{st.covered} / {m.cdsLength} bp · chr {m.chromosome} · {countLabel} · {tiers.join(', ')}</span>
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
      <div className="panel gene-path lab-path" data-testid="lab-panel">
        <div className="row-between">
          <h2 className="gene">Enzyme lab <span>· optional</span></h2>
          <span className="muted small">Practice anytime</span>
        </div>
        <p className="muted small lab-note">One free use of each power to learn it. Practice only — no coverage. Powers are exclusive to this optional lab; campaign sliding puzzles use Undo, Hint and Restart.</p>
        <ol className="nodes">
          {labs.map((l, i) => {
            const done = completed.includes(l.id);
            const p = l.lab!;
            return (
              <li key={l.id}>
                <button
                  type="button"
                  className={`node lab ${done ? 'done' : ''} ${l.id === currentLevelId ? 'current' : ''}`}
                  onClick={() => onPlay(l.id)}
                  aria-label={`Enzyme lab ${i + 1}: ${POWER_LABEL[p]}${done ? ', complete' : ''}`}
                >
                  <span className="node-num">{done ? '✓' : POWER_ICON[p]}</span>
                  <span className="node-title">{POWER_LABEL[p]} <small>⚡{POWER_COST[p]}</small></span>
                  <span className="node-mode">{POWER_BLURB[p]}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      {legacyM1.length > 0 && (
        <p className="muted small legacy" data-testid="legacy-m1">M1 history: you completed prototype level{legacyM1.length > 1 ? 's' : ''} {legacyM1.map((id) => Number(id.slice(-2))).join(', ')}. The prototype challenges are kept here as history only.</p>
      )}
    </section>
  );
}

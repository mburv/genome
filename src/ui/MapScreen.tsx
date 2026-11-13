import type { LevelDefinition } from '../engine/types.ts';
import { CATALOGUE_SIZE, GENES, GENE_ORDER, MANIFEST } from '../genomics/genes.ts';
import { chapterOf, coveredBases, isDiscovered, levelsForGene, sampleBases } from '../campaign/campaign.ts';
import { assemblyStatus } from '../campaign/assembly.ts';
import { tierName } from '../campaign/chapters.ts';
import { MODE_GLYPH, MODE_LABEL } from './modes.ts';
import { POWER_BLURB, POWER_ICON, POWER_LABEL } from './PowerTray.tsx';
import { POWER_COST } from '../engine/powers.ts';

interface Props {
  levels: readonly LevelDefinition[];
  labs: readonly LevelDefinition[];
  completed: readonly string[];
  attempted: readonly string[];
  currentLevelId: string;
  legacyM1: readonly string[];
  onPlay: (levelId: string) => void;
  onCard: (symbol: string) => void;
}

export function MapScreen({ levels, labs, completed, attempted, currentLevelId, legacyM1, onPlay, onCard }: Props) {
  const nextSample = levels.find((l) => !completed.includes(l.id));
  const nextChapter = MANIFEST.included.flatMap((g) => chapterOf(g.symbol)).find((l) => !completed.includes(l.id));
  const next = nextSample ?? nextChapter ?? levels.find((l) => l.id === currentLevelId) ?? levels[0]!;
  const themes = [...new Set(MANIFEST.included.map((g) => g.theme))];
  return (
    <section className="map" aria-label="Level map" data-testid="level-map">
      <button type="button" className="primary big" onClick={() => onPlay(next.id)} data-testid="continue">
        {completed.length === 0 ? 'Start' : !nextSample && !nextChapter ? 'Replay' : 'Continue'} · {next.chapter ? `${next.symbol} assembly ${next.chapter.part}/${next.chapter.of}` : `Level ${next.index + 1}: ${next.title}`}
      </button>
      {GENE_ORDER.map((symbol) => {
        const gene = GENES[symbol]!;
        const own = levelsForGene(symbol, levels);
        const covered = coveredBases(completed, symbol, levels);
        const sample = sampleBases(symbol, levels);
        const discovered = isDiscovered(completed, symbol, levels);
        return (
          <div key={symbol} className="panel gene-path" data-testid={`gene-${symbol}`}>
            <div className="row-between">
              <h2 className="gene">{symbol} <span>· {gene.name}</span></h2>
              <span className="muted small">Chr {gene.chromosome} · {gene.transcript}</span>
            </div>
            <div className="progress" role="progressbar" aria-label={`${symbol} sample bases`} aria-valuemin={0} aria-valuemax={sample} aria-valuenow={covered}>
              <i style={{ width: `${(100 * covered) / sample}%` }} />
            </div>
            <div className="row-between muted small">
              <span data-testid={`progress-${symbol}`}>{covered} / {sample} sample bases</span>
              <span>{covered} of {gene.cdsLength} CDS bases</span>
            </div>
            <ol className="nodes">
              {own.map((l) => {
                const done = completed.includes(l.id);
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      className={`node ${done ? 'done' : ''} ${l.id === currentLevelId ? 'current' : ''} ${attempted.includes(l.id) && !done ? 'started' : ''}`}
                      onClick={() => onPlay(l.id)}
                      aria-label={`Level ${l.index + 1}: ${l.title}, ${MODE_LABEL[l.mode]}${done ? ', complete' : ''}`}
                    >
                      <span className="node-num">{done ? '✓' : l.index + 1}</span>
                      <span className="node-glyph" aria-hidden="true">{MODE_GLYPH[l.mode]}</span>
                      <span className="node-title">{l.title}</span>
                      <span className="node-mode">{MODE_LABEL[l.mode]} · {l.metrics.rating}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <button type="button" className={`card-button ${discovered ? 'unlocked' : ''}`} onClick={() => onCard(symbol)} data-testid={`card-${symbol}`}>
              {discovered ? `🧬 ${symbol} gene card` : `🔒 Discovery card — complete all ${own.length}`}
            </button>
          </div>
        );
      })}
      <div className="panel catalogue" data-testid="catalogue">
        <div className="row-between">
          <h2 className="gene">Gene catalogue <span>· full assembly</span></h2>
          <span className="muted small" data-testid="catalogue-count">{CATALOGUE_SIZE} verified genes</span>
        </div>
        <p className="muted small lab-note">Each chapter rebuilds a gene’s entire coding sequence (MANE Select RefSeq) from multi-base tiles. A gene is assembled only when every base is placed and the SHA-256 matches. Solving the first puzzle discovers the gene.</p>
        {themes.map((theme) => (
          <div key={theme} className="theme">
            <h3 className="theme-title">{theme}</h3>
            {MANIFEST.included.filter((g) => g.theme === theme).map((m) => {
              const gene = GENES[m.symbol]!;
              const chapter = chapterOf(m.symbol);
              const st = assemblyStatus(completed, gene);
              const disc = isDiscovered(completed, m.symbol, levels);
              const nextPart = chapter.find((l) => !completed.includes(l.id)) ?? chapter[0]!;
              const tiers = [...new Set(chapter.map((l) => l.tier!))].sort((a, b) => a - b);
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
                    <span data-testid={`cat-progress-${m.symbol}`}>{st.covered} / {m.cdsLength} bp · chr {m.chromosome} · {chapter.length} puzzles · {tiers.map(tierName).join(', ')}</span>
                  </div>
                  <ol className="chapter-nodes" aria-label={`${m.symbol} assembly puzzles`}>
                    {chapter.map((l) => {
                      const done = completed.includes(l.id);
                      return (
                        <li key={l.id}>
                          <button
                            type="button"
                            className={`cnode ${done ? 'done' : ''} ${l.id === currentLevelId ? 'current' : ''} ${attempted.includes(l.id) && !done ? 'started' : ''}`}
                            onClick={() => onPlay(l.id)}
                            aria-label={`${m.symbol} assembly ${l.chapter!.part} of ${l.chapter!.of}: ${MODE_LABEL[l.mode]}, ${l.tier}-base tiles${done ? ', complete' : ''}`}
                            data-testid={`cnode-${l.id}`}
                          >
                            {done ? '✓' : l.chapter!.part}
                          </button>
                        </li>
                      );
                    })}
                    <li><button type="button" className="cnode play" onClick={() => onPlay(nextPart.id)} aria-label={`Play ${m.symbol} assembly`}>▶</button></li>
                  </ol>
                </div>
              );
            })}
          </div>
        ))}
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
          <span className="muted small">Powers from level 4</span>
        </div>
        <p className="muted small lab-note">One free use of each power to learn it. Practice only — no coverage. In the campaign powers cost energy, and every level can be solved without them.</p>
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
        <p className="muted small legacy" data-testid="legacy-m1">M1 history: you completed prototype level{legacyM1.length > 1 ? 's' : ''} {legacyM1.map((id) => Number(id.slice(-2))).join(', ')}. Equivalent M2 credit is applied where the challenge is identical.</p>
      )}
    </section>
  );
}

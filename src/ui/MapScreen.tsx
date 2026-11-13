import type { LevelDefinition } from '../engine/types.ts';
import { GENES, GENE_ORDER } from '../genomics/genes.ts';
import { coveredBases, isDiscovered, levelsForGene, sampleBases } from '../campaign/campaign.ts';
import { MODE_GLYPH, MODE_LABEL } from './modes.ts';

interface Props {
  levels: readonly LevelDefinition[];
  completed: readonly string[];
  attempted: readonly string[];
  currentLevelId: string;
  legacyM1: readonly string[];
  onPlay: (levelId: string) => void;
  onCard: (symbol: string) => void;
}

export function MapScreen({ levels, completed, attempted, currentLevelId, legacyM1, onPlay, onCard }: Props) {
  const next = levels.find((l) => !completed.includes(l.id)) ?? levels.find((l) => l.id === currentLevelId) ?? levels[0]!;
  return (
    <section className="map" aria-label="Level map" data-testid="level-map">
      <button type="button" className="primary big" onClick={() => onPlay(next.id)} data-testid="continue">
        {completed.length === 0 ? 'Start' : completed.length === levels.length ? 'Replay' : 'Continue'} · Level {next.index + 1}: {next.title}
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
              {discovered ? `🧬 ${symbol} discovery card` : `🔒 Discovery card — complete all ${own.length}`}
            </button>
          </div>
        );
      })}
      {legacyM1.length > 0 && (
        <p className="muted small legacy" data-testid="legacy-m1">M1 history: you completed prototype level{legacyM1.length > 1 ? 's' : ''} {legacyM1.map((id) => Number(id.slice(-2))).join(', ')}. Equivalent M2 credit is applied where the challenge is identical.</p>
      )}
    </section>
  );
}

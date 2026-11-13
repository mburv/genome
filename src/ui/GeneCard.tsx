import type { GeneAsset } from '../genomics/genes.ts';
import { MANIFEST } from '../genomics/genes.ts';
import type { LevelDefinition } from '../engine/types.ts';
import { chapterOf, coveredBases, isDiscovered, levelsForGene, sampleBases } from '../campaign/campaign.ts';
import { assemblyStatus } from '../campaign/assembly.ts';

interface Props {
  gene: GeneAsset;
  completed: readonly string[];
  levels: readonly LevelDefinition[];
  onPlay: (levelId: string) => void;
  onBack: () => void;
}

/**
 * Gene card. Discovery (a sample or the chapter opener) and assembly (every coding base placed by the
 * player, exact and SHA-256 verified) are separate states.
 */
export function GeneCard({ gene, completed, levels, onPlay, onBack }: Props) {
  const own = levelsForGene(gene.symbol, levels);
  const covered = coveredBases(completed, gene.symbol, levels);
  const sample = sampleBases(gene.symbol, levels);
  const discovered = isDiscovered(completed, gene.symbol, levels);
  const status = assemblyStatus(completed, gene);
  const chapter = chapterOf(gene.symbol);
  const nextPuzzle = chapter.find((l) => !completed.includes(l.id));
  const theme = MANIFEST.included.find((m) => m.symbol === gene.symbol)?.theme;
  const state = status.verified ? 'Assembled' : discovered ? 'Discovered' : 'Locked';
  return (
    <section className={`gene-card panel ${status.verified ? 'is-assembled' : ''}`} aria-labelledby="card-title" data-testid="gene-card">
      <div className="row-between">
        <span className={`mode ${status.verified ? 'mode-assembled' : ''}`} data-testid="card-state">{status.verified ? '🧬 ' : ''}{state}</span>
        <button type="button" onClick={onBack}>← Map</button>
      </div>
      <h2 id="card-title" className="card-symbol">{gene.symbol}</h2>
      <p className="card-name">{gene.name} · chromosome {gene.chromosome}{theme ? ` · ${theme}` : ''}</p>
      {discovered || status.verified ? (
        <>
          <p className="card-summary">“{gene.functionSummary}”</p>
          <p className="muted tiny">— {gene.functionSummaryCredit}</p>
        </>
      ) : (
        <p>{own.length > 0 ? `Complete all ${own.length === 6 ? 'six' : own.length} ${gene.symbol} challenges (or the first assembly puzzle) to discover this gene. ${covered} / ${sample} sample bases so far.` : `Solve the first ${gene.symbol} assembly puzzle to discover this gene.`}</p>
      )}
      {(discovered || status.verified) && (<>
      <div className="card-strand" aria-label={`Player-assembled coding sequence: ${status.covered} of ${gene.cdsLength} bases`} data-testid="card-strand">
        {status.assembled.split('').map((b, i) => <span key={i} className={b === '·' ? 'dot unknown' : `dot b-${b}`} />)}
      </div>
      <p data-testid="card-coverage">
        <b>{status.covered} of {gene.cdsLength}</b> coding bases assembled.{' '}
        {status.verified ? <b>Fully assembled — exact match, SHA-256 verified.</b> : <b>Not yet assembled</b>}
        {!status.verified && ' — every coding base must be placed by a solved puzzle.'}
      </p>
      </>)}
      {status.verified && (
        <details className="assembled-seq" data-testid="assembled-sequence">
          <summary>Your assembled sequence ({gene.cdsLength} bases)</summary>
          <p className="mono tiny seq-wrap">{status.assembled.match(/.{1,60}/g)!.join('\n')}</p>
        </details>
      )}
      {chapter.length > 0 && !status.verified && (
        <button type="button" className="primary" onClick={() => onPlay((nextPuzzle ?? chapter[0]!).id)} data-testid="card-play-chapter">
          {nextPuzzle ? `Assemble ${gene.symbol} · puzzle ${nextPuzzle.chapter!.part} / ${chapter.length}` : `Replay ${gene.symbol} assembly`}
        </button>
      )}
      <dl className="card-meta">
        <dt>Transcript</dt><dd><a href={gene.sourceUrl} target="_blank" rel="noopener noreferrer">{gene.transcript}</a> ({gene.keywords.replace(/\.$/, '')})</dd>
        <dt>Protein</dt><dd>{gene.protein} · {gene.proteinLength} aa (translation verified)</dd>
        <dt>CDS</dt><dd>{gene.cdsLocation} · {gene.cdsLength} bases incl. stop</dd>
        <dt>Gene ID</dt><dd>{gene.geneId}</dd>
        <dt>SHA-256</dt><dd className="mono" data-testid="card-checksum">{gene.sequenceSha256.slice(0, 20)}…{status.verified ? ' ✓ matches your assembly' : ''}</dd>
        <dt>Retrieved</dt><dd>{gene.retrievedAt.slice(0, 10)} from NCBI RefSeq</dd>
      </dl>
      <p className="muted tiny">Reference sequence, not anyone’s personal genome. No medical meaning.</p>
    </section>
  );
}

import type { GeneAsset } from '../genomics/genes.ts';
import {FAMOUS_REFERENCE} from '../genomics/sharedReference.ts';
import { MANIFEST } from '../genomics/genes.ts';
import { runOf, isDiscovered } from '../campaign/campaign.ts';
import { assemblyStatus } from '../campaign/assembly.ts';

interface Props {
  gene: GeneAsset;
  completed: readonly string[];
  historicalCompleted?:readonly string[];
  onPlay: (levelId: string) => void;
  onBack: () => void;
  onContinue?: (() => void) | undefined;
  nextGene?: string | undefined;
  completion?: boolean;
}

/**
 * Gene card. Discovery (the first puzzle of the gene's run) and assembly (every coding base
 * placed by the player, exact and SHA-256 verified) are separate states.
 */
export function GeneCard({ gene, completed, historicalCompleted=[], onPlay, onBack, onContinue, nextGene, completion=false }: Props) {
  const discovered = isDiscovered([...completed,...historicalCompleted], gene.symbol);
  const status = assemblyStatus(completed, gene);
  const run = runOf(gene.symbol);
  const nextPuzzle = run.find((l) => !completed.includes(l.id)&&!historicalCompleted.includes(l.id));
  const theme = MANIFEST.included.find((m) => m.symbol === gene.symbol)?.theme;
  const state = status.verified ? 'Assembled' : completion ? 'Final level complete' : discovered ? 'Discovered' : 'Locked';
  return (
    <section className={`gene-card panel ${status.verified ? 'is-assembled' : ''}`} aria-labelledby="card-title" data-testid="gene-card">
      <div className="row-between">
        <span className={`mode ${status.verified ? 'mode-assembled' : ''}`} data-testid="card-state">{status.verified ? '🧬 ' : ''}{state}</span>
        <button type="button" onClick={onBack}>← Map</button>
      </div>
      <h2 id="card-title" className="card-symbol">{gene.symbol}</h2>
      <p className="card-name">{gene.name} · chromosome {gene.chromosome}{theme ? ` · ${theme}` : ''}</p>
      {discovered || status.verified || completion ? (
        <>
          <p className="card-summary">“{gene.functionSummary}”</p>
          <p className="muted tiny">— {gene.functionSummaryCredit}</p>
        </>
      ) : (
        <p>Solve the first {gene.symbol} puzzle to discover this gene.</p>
      )}
      {(discovered || status.verified || completion) && (<>
      <div className="card-strand" aria-label={`Player-assembled coding sequence: ${status.covered} of ${gene.cdsLength} bases`} data-testid="card-strand">
        {status.assembled.split('').map((b, i) => <span key={i} className={b === '·' ? 'dot unknown' : `dot b-${b}`} />)}
      </div>
      <p data-testid="card-coverage">
        <b>{status.covered} of {gene.cdsLength}</b> coding bases assembled.{' '}
        {status.verified ? <b>Fully assembled — exact match, SHA-256 verified.</b> : <b>Not yet assembled</b>}
        {!status.verified && ' — every coding base must be placed by a solved puzzle.'}
      </p>
      </>)}
      {(status.verified || completion) && onContinue && <button type="button" className="primary" data-testid="card-continue" onClick={onContinue}>Continue{nextGene ? ` to ${nextGene}` : ''} →</button>}
      {(status.verified || completion) && (
        <section className="assembled-seq" aria-labelledby="assembled-sequence-title" data-testid="assembled-sequence">
          <h3 id="assembled-sequence-title">{status.verified ? 'Your assembled sequence' : 'Your assembled sequence so far'} ({status.covered} bases)</h3>
          {!status.verified && <p className="muted tiny">Dots mark bases not yet assembled against the current reference.</p>}
          <p className="mono tiny seq-wrap">{status.assembled}</p>
        </section>
      )}
      {run.length > 0 && !status.verified && (
        <button type="button" className="primary" onClick={() => onPlay((nextPuzzle ?? run[0]!).id)} data-testid="card-play-chapter">
          {nextPuzzle ? `Play ${gene.symbol} · puzzle ${run.findIndex((l) => l.id === nextPuzzle.id) + 1} / ${run.length}` : `Replay ${gene.symbol}`}
        </button>
      )}
      <dl className="card-meta">
        <dt>Transcript</dt><dd><a href={gene.sourceUrl} target="_blank" rel="noopener noreferrer">{gene.transcript}</a> ({gene.keywords.replace(/\.$/, '')})</dd>
        <dt>Protein</dt><dd>{gene.protein} · {gene.proteinLength} aa ({gene.translationVerified?'reference translation verified':'RefSeq protein annotation'})</dd>
        <dt>CDS</dt><dd>{FAMOUS_REFERENCE[gene.symbol]!.chromosome} · {gene.cdsLength} reference bases incl. stop</dd>
        <dt>Gene ID</dt><dd>{gene.geneId}</dd>
        <dt>SHA-256</dt><dd className="mono" data-testid="card-checksum">{gene.sequenceSha256.slice(0, 20)}…{status.verified ? ' ✓ matches your assembly' : ''}</dd>
        <dt>Retrieved</dt><dd>{gene.retrievedAt.slice(0, 10)} annotation from NCBI RefSeq</dd>
      </dl>
      <p className="muted tiny">Coding sequence extracted from T2T-CHM13v2.0+Y, shared with Human Genome. Reference sequence, not anyone’s personal genome. No medical meaning.</p>
    </section>
  );
}

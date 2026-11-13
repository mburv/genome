import type { GeneAsset } from '../genomics/genes.ts';
import type { LevelDefinition } from '../engine/types.ts';
import { coveredBases, sampleBases } from '../campaign/campaign.ts';

interface Props {
  gene: GeneAsset;
  completed: readonly string[];
  levels: readonly LevelDefinition[];
  onBack: () => void;
}

/** Discovery card: a sample of the gene was sequenced — never "assembled". */
export function GeneCard({ gene, completed, levels, onBack }: Props) {
  const covered = coveredBases(completed, gene.symbol, levels);
  const sample = sampleBases(gene.symbol, levels);
  const discovered = levels.filter((l) => l.symbol === gene.symbol).every((l) => completed.includes(l.id));
  return (
    <section className="gene-card panel" aria-labelledby="card-title" data-testid="gene-card">
      <div className="row-between">
        <span className="mode">{discovered ? 'Discovered' : 'Locked'}</span>
        <button type="button" onClick={onBack}>← Map</button>
      </div>
      <h2 id="card-title" className="card-symbol">{gene.symbol}</h2>
      <p className="card-name">{gene.name} · chromosome {gene.chromosome}</p>
      {discovered ? (
        <>
          <p className="card-summary">“{gene.functionSummary}”</p>
          <p className="muted tiny">— {gene.functionSummaryCredit}</p>
          <div className="card-strand" aria-label={`Sequenced sample: first ${covered} coding bases`}>
            {gene.sequence.slice(0, covered).split('').map((b, i) => (
              <span key={i} className={`dot b-${b}`} title={b} />
            ))}
            {Array.from({ length: Math.min(60, gene.cdsLength - covered) }, (_, i) => <span key={`u${i}`} className="dot unknown" />)}
          </div>
          <p data-testid="card-coverage"><b>{covered} of {gene.cdsLength}</b> coding bases sampled ({sample} in this demo). <b>Not yet assembled</b> — full assembly needs every coding base.</p>
        </>
      ) : (
        <p>Complete all six {gene.symbol} challenges to discover this gene. {covered} / {sample} sample bases so far.</p>
      )}
      <dl className="card-meta">
        <dt>Transcript</dt><dd><a href={gene.sourceUrl} target="_blank" rel="noopener noreferrer">{gene.transcript}</a> ({gene.keywords.replace(/\.$/, '')})</dd>
        <dt>Protein</dt><dd>{gene.protein} · {gene.proteinLength} aa (translation verified)</dd>
        <dt>CDS</dt><dd>{gene.cdsLocation} · {gene.cdsLength} bases incl. stop</dd>
        <dt>Gene ID</dt><dd>{gene.geneId}</dd>
        <dt>SHA-256</dt><dd className="mono">{gene.sequenceSha256.slice(0, 20)}…</dd>
        <dt>Retrieved</dt><dd>{gene.retrievedAt.slice(0, 10)} from NCBI RefSeq</dd>
      </dl>
      <p className="muted tiny">Reference sequence, not anyone’s personal genome. No medical meaning.</p>
    </section>
  );
}

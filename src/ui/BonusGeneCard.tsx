import type { CdsGene } from '../genomics/bonusAnnotations.ts';
import { cdsLength } from '../genomics/bonusAnnotations.ts';
import { GENES } from '../genomics/genes.ts';

interface Props {
  gene: CdsGene;
  chromosome: string;
  onMap: () => void;
  onContinue: () => void;
  hasNextGene?: boolean;
}

/** A gene milestone card, using the same Swiss card typography as Famous Genes.
 * Completion means all annotated CDS bases are covered by chromosome puzzles.
 * It does not assert that the spliced coding sequence or its translation was
 * independently SHA-256 verified. */
export function BonusGeneCard({ gene, chromosome, onMap, onContinue, hasNextGene = false }: Props) {
  const [id, symbol, biotype, start, end, strand, transcript] = gene;
  const known = GENES[symbol];
  return (
    <div className="overlay bonus-gene-overlay" role="dialog" aria-modal="true" aria-labelledby="bonus-gene-title" data-testid="bonus-gene-card">
      <section className="card bonus-gene-card gene-card">
        <div className="row-between">
          <span className="mode mode-assembled">🧬 CDS covered</span>
          <button type="button" onClick={onMap} aria-label="Back to Human Genome map">← Map</button>
        </div>
        <h2 id="bonus-gene-title" className="card-symbol">{symbol}</h2>
        <p className="card-name">{known?.name ?? 'Annotated gene'} · {chromosome} · {biotype.replace(/_/g, ' ')}</p>
        {known && <><p className="card-summary">“{known.functionSummary}”</p><p className="muted tiny">— {known.functionSummaryCredit}</p></>}
        {!known && <p className="card-summary">This gene is annotated in the T2T-CHM13v2.0 reference. Its coding exons are now covered by the chromosome puzzles you completed.</p>}
        <p className="discovered assembled"><b>{cdsLength(gene).toLocaleString()} coding bases covered</b> across {gene[7].length} annotated CDS exon{gene[7].length===1?'':'s'}.</p>
        <dl className="card-meta">
          <dt>Chromosome</dt><dd>{chromosome}:{(start+1).toLocaleString()}–{end.toLocaleString()}</dd>
          <dt>Strand</dt><dd>{strand==='-'?'Reverse (−)':'Forward (+)'}</dd>
          <dt>Transcript</dt><dd className="mono">{transcript}</dd>
          <dt>Annotation</dt><dd>RefSeq Liftoff v5.3 · T2T-CHM13v2.0</dd>
          <dt>Gene record</dt><dd className="mono">{id}</dd>
        </dl>
        <p className="muted tiny">All positions in the representative annotated CDS have been covered by verified puzzle completions. This is reference coverage, not a separate spliced-sequence checksum or protein-translation verification.</p>
        <div className="card-actions">
          <button type="button" onClick={onMap}>Genome map</button>
          <button type="button" className="primary" onClick={onContinue}>{hasNextGene?'Next gene card →':'Continue →'}</button>
        </div>
      </section>
    </div>
  );
}

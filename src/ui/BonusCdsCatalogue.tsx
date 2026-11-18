import { useMemo, useState } from 'react';
import {
  CHROMOSOMES, genomeLevelInterval, type BonusProgress,
} from '../campaign/bonus.ts';
import {
  cdsComplete, cdsCovered, cdsGeneLevelCoverage, cdsGeneLevels, cdsLength,
  nextCdsGeneLevel, type CdsGene, type CdsIndex,
} from '../genomics/bonusAnnotations.ts';
import { GENES, MANIFEST } from '../genomics/genes.ts';

interface GeneEntry { chrom: string; gene: CdsGene }
interface Props {
  annotations: Readonly<Record<string, CdsIndex>>;
  availableChromosomes: ReadonlySet<string>;
  progress: BonusProgress;
  busy: boolean;
  onPlay: (chrom: string, chromosomeLevel: number) => void;
  onCard: (chrom: string, gene: CdsGene) => void;
}

const GENE_PAGE = 8;
const GENE_LEVEL_PAGE = 12;
const priority = new Map(MANIFEST.included.map((gene, index) => [gene.symbol, index]));
const chromosomeOrder = new Map(Object.keys(CHROMOSOMES).map((chrom, index) => [chrom, index]));

/** Named CDS catalogue is a navigational view of the *same* stable
 * chromosome puzzles, not a second campaign with duplicate base credit. */
export function BonusCdsCatalogue({ annotations, availableChromosomes, progress, busy, onPlay, onCard }: Props) {
  const [query, setQuery] = useState('');
  const [chromosome, setChromosome] = useState('');
  const [page, setPage] = useState(0);
  const [genePages, setGenePages] = useState<Record<string, number>>({});

  const genes = useMemo(() => {
    const all: GeneEntry[] = [];
    for (const [chrom, index] of Object.entries(annotations)) {
      for (const gene of index.genes) all.push({ chrom, gene });
    }
    all.sort((a, b) => {
      const aFeatured = priority.get(a.gene[1]), bFeatured = priority.get(b.gene[1]);
      if (aFeatured !== undefined || bFeatured !== undefined) {
        if (aFeatured === undefined) return 1;
        if (bFeatured === undefined) return -1;
        if (aFeatured !== bFeatured) return aFeatured - bFeatured;
      }
      return (chromosomeOrder.get(a.chrom) ?? 100) - (chromosomeOrder.get(b.chrom) ?? 100) ||
        a.gene[3] - b.gene[3] || a.gene[0].localeCompare(b.gene[0]);
    });
    return all;
  }, [annotations]);

  const found = useMemo(() => {
    const text = query.trim().toLocaleLowerCase();
    return genes.filter(({chrom,gene}) =>
      (!chromosome || chrom === chromosome) &&
      (!text || [gene[1], gene[0], gene[6], gene[8] ?? '', GENES[gene[1]]?.name ?? ''].some(v =>
        v.toLocaleLowerCase().includes(text))));
  }, [genes, query, chromosome]);
  const totalPages = Math.max(1, Math.ceil(found.length / GENE_PAGE));
  const currentPage = Math.min(page, totalPages - 1);
  const entries = found.slice(currentPage * GENE_PAGE, (currentPage + 1) * GENE_PAGE);
  const loadedChromosomes = Object.keys(annotations).length;

  return (
    <section className="panel catalogue bonus-cds-catalogue" data-testid="bonus-cds-catalogue" aria-labelledby="bonus-cds-title">
      <div className="row-between">
        <h3 className="gene" id="bonus-cds-title">CDS genes</h3>
        <span className="cat-state" data-testid="bonus-cds-count">{genes.length.toLocaleString()} annotated genes</span>
      </div>
      <p className="muted small">Named coding genes, with progress through their annotated CDS. Famous Genes appear first; use search to find any other coding gene.</p>
      {loadedChromosomes < Object.keys(CHROMOSOMES).length &&
        <p className="muted tiny" role="status">Loading CDS annotations · {loadedChromosomes} / {Object.keys(CHROMOSOMES).length} chromosomes</p>}
      <div className="bonus-cds-filters">
        <input type="search" placeholder="Search CDS genes" aria-label="Search CDS genes"
          value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} />
        <select aria-label="Filter CDS genes by chromosome" value={chromosome}
          onChange={e=>{setChromosome(e.target.value);setPage(0);}}>
          <option value="">All chromosomes</option>
          {Object.keys(CHROMOSOMES).map(chrom=><option value={chrom} key={chrom}>{chrom}</option>)}
        </select>
      </div>
      <p className="muted tiny" data-testid="bonus-cds-results">{found.length.toLocaleString()} matching CDS genes</p>
      {entries.length === 0 && <p className="muted small">{loadedChromosomes<25?'Gene annotations are loading.':'No matching coding genes.'}</p>}
      {entries.map(({ chrom, gene }) => {
        const key = chrom + ':' + gene[0], chromLen = CHROMOSOMES[chrom]!;
        const available = availableChromosomes.has(chrom);
        const length = cdsLength(gene), credited = cdsCovered(gene,progress,chrom);
        const finished = cdsComplete(gene,progress,chrom);
        const levels = cdsGeneLevels(gene,chromLen);
        const nextLevel = nextCdsGeneLevel(gene,progress,chrom);
        const firstLevel = nextLevel ?? levels[0];
        const name = GENES[gene[1]]?.name ?? (gene[8] && gene[8] !== gene[1] ? gene[8] : 'Protein-coding gene');
        const levelPages = Math.max(1,Math.ceil(levels.length/GENE_LEVEL_PAGE));
        const defaultLevelPage = Math.floor(Math.max(0,levels.indexOf(firstLevel ?? 0))/GENE_LEVEL_PAGE);
        const levelPage = Math.max(0, Math.min(levelPages-1, genePages[key] ?? defaultLevelPage));
        const shown = levels.slice(levelPage*GENE_LEVEL_PAGE,(levelPage+1)*GENE_LEVEL_PAGE);
        return (
          <section className={'cat-gene bonus-cds-gene'+(finished?' assembled':'')} key={key}
            data-testid={'bonus-cds-gene-'+gene[0]}>
            <div className="row-between">
              <button type="button" className="cat-name" onClick={()=>finished?onCard(chrom,gene):firstLevel!==undefined&&onPlay(chrom,firstLevel)}
                disabled={busy||(!finished&&firstLevel===undefined)}>
                <b>{gene[1]}</b> <span className="muted small">{name}</span>
              </button>
              <span className={'cat-state'+(finished?' ok':'')}>{finished?'🧬 CDS covered':credited?'In progress':'New'}</span>
            </div>
            <p className="muted tiny">{chrom} · {gene[5]==='-'?'Reverse strand':'Forward strand'} · {gene[6]}</p>
            <div className="progress thin" role="progressbar"
              aria-label={gene[1]+' CDS bases covered'} aria-valuemin={0} aria-valuemax={length} aria-valuenow={credited}>
              <i style={{width:100*credited/length+'%'}}/>
            </div>
            <div className="row-between muted tiny">
              <span>{credited.toLocaleString()} / {length.toLocaleString()} coding bp · {levels.length.toLocaleString()} chromosome puzzle{levels.length===1?'':'s'}</span>
              {finished
                ? <button type="button" className="bonus-assemble" onClick={()=>onCard(chrom,gene)}>Gene card</button>
                : <button type="button" className="bonus-assemble" disabled={busy||firstLevel===undefined}
                    onClick={()=>{if(firstLevel!==undefined)onPlay(chrom,firstLevel);}}>
                    {available?'Play CDS →':'Download & play →'}
                  </button>}
            </div>
            <ol className={'chapter-nodes bonus-cds-nodes'+(available?'':' unavailable')} aria-label={gene[1]+' CDS-linked puzzles'} data-testid={'bonus-cds-nodes-'+gene[0]}>
              {shown.map(level=>{
                const relativeIndex=levels.indexOf(level)+1;
                const iv=genomeLevelInterval(chromLen,level);
                const status=cdsGeneLevelCoverage(gene,progress,chrom,chromLen,level);
                const done=status.total>0&&status.covered===status.total;
                return <li key={level}><button type="button" className={'cnode'+(done?' done':'')+(level===nextLevel?' current':'')+(status.covered>0&&!done?' started':'')}
                  disabled={busy||!available} onClick={()=>onPlay(chrom,level)}
                  data-testid={'bonus-cds-node-'+gene[0]+'-'+relativeIndex}
                  aria-label={gene[1]+' CDS puzzle '+relativeIndex+' of '+levels.length+', '+chrom+' level '+level+(done?', complete':'')}
                  title={chrom+':'+(iv[0]+1).toLocaleString()+'–'+iv[1].toLocaleString()+' · chromosome level '+level}>
                  <span className="node-number">{relativeIndex}</span>{done&&<span className="node-check" aria-hidden="true">✓</span>}
                </button></li>;
              })}
            </ol>
            {levelPages>1&&<div className="row-between bonus-pagination">
              <button type="button" disabled={levelPage===0} onClick={()=>setGenePages(old=>({...old,[key]:levelPage-1}))}
                aria-label={'Previous '+gene[1]+' CDS puzzles'}>‹</button>
              <span className="muted tiny">{levelPage*GENE_LEVEL_PAGE+1}–{Math.min((levelPage+1)*GENE_LEVEL_PAGE,levels.length)} / {levels.length}</span>
              <button type="button" disabled={levelPage===levelPages-1} onClick={()=>setGenePages(old=>({...old,[key]:levelPage+1}))}
                aria-label={'Next '+gene[1]+' CDS puzzles'}>›</button>
            </div>}
          </section>
        );
      })}
      {totalPages>1&&<div className="row-between bonus-pagination bonus-cds-pages">
        <button type="button" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)} aria-label="Previous CDS genes">‹ Previous</button>
        <span className="muted tiny">{currentPage+1} / {totalPages.toLocaleString()}</span>
        <button type="button" disabled={currentPage===totalPages-1} onClick={()=>setPage(currentPage+1)} aria-label="Next CDS genes">Next ›</button>
      </div>}
      <p className="muted tiny">CDS gene squares open their corresponding chromosome puzzles; no bases are counted twice. A mixed exon/noncoding level may also appear under Chromosome coordinates below.</p>
    </section>
  );
}

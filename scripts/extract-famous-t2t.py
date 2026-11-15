"""Extract the exact Famous Genes CDSs from the same packed T2T reference as bonus play."""
import collections
import gzip
import hashlib
import json
import pathlib
import re
import struct
from urllib.parse import unquote
import importlib.util
spec=importlib.util.spec_from_file_location('prepare_genome',pathlib.Path(__file__).with_name('prepare-genome.py'))
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
GFF,download=module.GFF,module.download
from Bio.Align import PairwiseAligner

ROOT=pathlib.Path("src/genomics")
PACKS=pathlib.Path("genome-packs")
BASES="ACGT"
COMP=str.maketrans("ACGT","TGCA")
def read_json(path): return json.loads(path.read_text())
def sha(s): return hashlib.sha256(s.encode()).hexdigest()
def attrs(raw): return dict((k,unquote(v)) for item in raw.split(";") if "=" in item for k,v in [item.split("=",1)])
def extract(pack, intervals, strand):
    with pack.open("rb") as f:
        n=struct.unpack("<I",f.read(4))[0]
        h=json.loads(f.read(n))
        assert h["reference"]=="T2T-CHM13v2.0+Y / GCA_009914755.4"
        data_start=4+n
        parts=[]
        for a,b in intervals:
            f.seek(data_start+a//4)
            data=f.read((b+3)//4-a//4)
            s="".join(BASES[(data[(i//4)-a//4]>>(6-2*(i%4)))&3] for i in range(a,b))
            parts.append(s if strand=="+" else s.translate(COMP)[::-1])
        return "".join(parts)
def main():
    genes=[read_json(ROOT/"ins.generated.json"),read_json(ROOT/"hbb.generated.json"),*read_json(ROOT/"catalogue.generated.json")["genes"]]
    gff=pathlib.Path("data/bonus-cache/chm13v2.0_RefSeq_Liftoff_v5.3.gff.gz")
    gff.parent.mkdir(parents=True,exist_ok=True)
    download(GFF,gff)
    groups=collections.defaultdict(list)
    meta={}
    with gzip.open(gff,"rt") as f:
        for line in f:
            if line.startswith("##FASTA"): break
            if line.startswith("#") or not line.strip(): continue
            c,_,kind,a,b,_,strand,phase,raw=line.rstrip("\n").split("\t")
            at=attrs(raw)
            if kind!="CDS":
                if "ID" in at: meta[at["ID"]]=(c,kind,at)
                continue
            for parent in at.get("Parent","").split(","):
                if parent: groups[parent].append((c,int(a)-1,int(b),strand,phase,at))
    out={}
    for g in genes:
        accession=g["transcript"].split(".")[0]
        candidates=[]
        for parent,features in groups.items():
            m=meta.get(parent,("", "", {}))[2]
            # Liftoff preserves RefSeq RNA identifiers; suffixes may mark extra copies.
            if not re.search(r"(?<![A-Za-z0-9])"+re.escape(accession)+r"(?![0-9])",parent+" "+str(m)): continue
            chrom=features[0][0]; strand=features[0][3]
            if any(x[0]!=chrom or x[3]!=strand for x in features): continue
            ivs=sorted(set((x[1],x[2]) for x in features),reverse=strand=="-")
            seq=extract(PACKS/(chrom+".genome"),ivs,strand)
            if not seq or len(seq)%3: continue
            aligner=PairwiseAligner()
            aligner.match_score=2;aligner.mismatch_score=-2;aligner.open_gap_score=-8;aligner.extend_gap_score=-1
            score=aligner.score(g["sequence"],seq)
            candidates.append((score,parent,chrom,strand,ivs,seq))
        if not candidates:
            raise ValueError("No CDS candidate for "+g["symbol"]+" "+accession)
        score,parent,chrom,strand,ivs,seq=max(candidates,key=lambda x:(x[0],-len(x[1]),x[1]))
        # All annotated segments, in transcript order, are mapped to the packed forward strand.
        old=g["sequence"]
        print(g["symbol"],parent,chrom,strand,len(old),len(seq),"identical" if old==seq else "changed",flush=True)
        out[g["symbol"]]={"chromosome":chrom,"strand":strand,"intervals":ivs,"sequence":seq,"sequenceSha256":sha(seq),"transcript":parent,"originalTranscript":g["transcript"],"reference":"T2T-CHM13v2.0+Y / GCA_009914755.4"}
    assert len(out)==31
    (ROOT/"famous-t2t.generated.json").write_text(json.dumps(out,separators=(",",":"))+"\n")
if __name__=="__main__": main()

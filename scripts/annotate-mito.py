"""Lift all 37 rCRS genes onto the actual CHM13 mitochondrial sequence."""
import argparse
import hashlib
import json
import pathlib
import struct
import urllib.request
from Bio import SeqIO
from Bio.Align import PairwiseAligner

URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nuccore&id=NC_012920.1&rettype=gb&retmode=text"
BASES = "ACGT"

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--pack", type=pathlib.Path, default=pathlib.Path("genome-packs/chrM.genome"))
    p.add_argument("--record", type=pathlib.Path, default=pathlib.Path("data/bonus-cache/NC_012920.1.gb"))
    a = p.parse_args()
    a.record.parent.mkdir(parents=True, exist_ok=True)
    if not a.record.exists():
        with urllib.request.urlopen(URL, timeout=90) as r:
            a.record.write_bytes(r.read())
    record = SeqIO.read(a.record, "genbank")
    if record.id != "NC_012920.1" or len(record.seq) != 16569:
        raise ValueError("Wrong mitochondrial annotation source")
    raw = a.pack.read_bytes()
    n = struct.unpack_from("<I", raw)[0]
    h = json.loads(raw[4:4+n])
    payload = raw[4+n:]
    if h["chromosome"] != "chrM" or h["length"] != 16569:
        raise ValueError("Wrong mitochondrial pack")
    if hashlib.sha256(payload).hexdigest() != h["chunkSha256"][0]:
        raise ValueError("Mitochondrial payload checksum mismatch")
    actual = "".join(BASES[(payload[i//4] >> (6-2*(i%4))) & 3] for i in range(h["length"]))
    offset = 576
    ref = str(record.seq).upper()
    rotated = ref[offset:] + ref[:offset]
    aligner = PairwiseAligner()
    aligner.mode = "global"
    aligner.match_score = 2
    aligner.mismatch_score = -2
    aligner.open_gap_score = -8
    aligner.extend_gap_score = -1
    alignment = aligner.align(rotated, actual)[0]
    mapping = {}
    for (r0,r1),(q0,q1) in zip(*alignment.aligned):
        for i in range(int(r1-r0)):
            mapping[int(r0)+i] = int(q0)+i
    identity = sum(rotated[r] == actual[q] for r,q in mapping.items()) / len(actual)
    if identity < 0.99:
        raise ValueError("Mitochondrial reference alignment failed: "+str(identity))
    genes = []
    for f in record.features:
        if f.type != "gene":
            continue
        symbol = f.qualifiers["gene"][0]
        start,end = int(f.location.start),int(f.location.end)
        if start < offset or end <= start:
            raise ValueError("Unexpected origin-spanning mitochondrial gene "+symbol)
        mapped = [mapping[i] for i in range(start-offset,end-offset) if i in mapping]
        if len(mapped) < (end-start)*0.98:
            raise ValueError("Poor mitochondrial gene mapping "+symbol)
        bio = None
        for child in record.features:
            if child.type in ("CDS","tRNA","rRNA") and child.qualifiers.get("gene",[None])[0] == symbol:
                bio = "protein_coding" if child.type == "CDS" else child.type
                break
        if not bio:
            raise ValueError("Missing gene biotype "+symbol)
        genes.append(["NC_012920.1:"+symbol,symbol,bio,min(mapped),max(mapped)+1,"-" if f.location.strand==-1 else "+"])
    if len(genes)!=37 or len({g[1] for g in genes})!=37:
        raise ValueError("Expected 37 unique mitochondrial genes")
    if sum(g[2]=="protein_coding" for g in genes)!=13 or sum(g[2]=="tRNA" for g in genes)!=22 or sum(g[2]=="rRNA" for g in genes)!=2:
        raise ValueError("Incorrect mitochondrial biotype counts")
    h["genes"]=sorted(genes,key=lambda g:g[3])
    h["annotation"]="NC_012920.1 gene coordinates aligned to CP068254.1"
    h["annotationSha256"]=hashlib.sha256(a.record.read_bytes()).hexdigest()
    h["annotationUrl"]=URL
    h["annotationMappingIdentity"]=identity
    header=json.dumps(h,separators=(",",":")).encode()
    a.pack.write_bytes(struct.pack("<I",len(header))+header+payload)
    print("Verified",len(genes),"mitochondrial genes; reference alignment identity",identity,flush=True)

if __name__ == "__main__":
    main()

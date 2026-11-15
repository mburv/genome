"""Pin a playable sample for every GENCODE v48 primary-assembly gene.
Build-time only: no API requests or private genetic data in the game.
"""
import argparse
import gzip
import hashlib
import json
import pathlib
import re
import urllib.request
import time
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "src/genomics/bonus.generated.json"
BASE = "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_48/"
GTF = "gencode.v48.primary_assembly.annotation.gtf.gz"
FA = "GRCh38.primary_assembly.genome.fa.gz"
RELEASE = "GENCODE v48 / GRCh38 primary assembly"
COMP = str.maketrans("ACGT", "TGCA")

def download(name, cache):
    path = cache / name
    if not path.exists():
        for attempt in range(3):
            try:
                print("Downloading", name, flush=True)
                with urllib.request.urlopen(BASE + name, timeout=120) as r, path.with_suffix(".part").open("wb") as f:
                    while chunk := r.read(1024 * 1024):
                        f.write(chunk)
                path.with_suffix(".part").replace(path)
                break
            except (OSError, TimeoutError):
                if attempt == 2:
                    raise
                time.sleep(5)
    return path

def digest(path):
    with path.open("rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()

def annotation(path):
    by_chr = defaultdict(list)
    seen = set()
    with gzip.open(path, "rt") as f:
        for line in f:
            if line.startswith("#"):
                continue
            chrom, _, kind, start, end, _, strand, _, attrs = line.rstrip("\n").split("\t")
            if kind != "gene":
                continue
            a = dict(re.findall(r'(\w+) "([^"]+)"', attrs))
            gid = a["gene_id"]
            if gid in seen:
                raise ValueError("Duplicate gene ID " + gid)
            seen.add(gid)
            by_chr[chrom].append((gid, a.get("gene_name", gid), a["gene_type"], int(start), int(end), strand))
    return by_chr

def fasta(path):
    with gzip.open(path, "rt") as f:
        chrom, chunks = None, []
        for line in f:
            if line.startswith(">"):
                if chrom is not None:
                    yield chrom, "".join(chunks).upper()
                chrom, chunks = line[1:].split()[0], []
            else:
                chunks.append(line.strip())
        if chrom is not None:
            yield chrom, "".join(chunks).upper()

def sample(sequence, start, end, strand):
    body = sequence[start - 1:end]
    if strand == "-":
        body = body.translate(COMP)[::-1]
    # First full unambiguous window in transcriptional orientation; short genes
    # use their longest unambiguous contiguous run. Never invent a base.
    m = re.search(r"[ACGT]{90}", body)
    if m is None:
        m = max(re.finditer(r"[ACGT]+", body), key=lambda x: x.end() - x.start(), default=None)
    if m is None:
        raise ValueError("No unambiguous reference bases")
    seq = m.group()[:90]
    first = start + m.start() if strand == "+" else end - m.start() - len(seq) + 1
    return first, first + len(seq) - 1, seq

def generate(gtf, fa, main):
    by_chr = annotation(gtf)
    genes, excluded = [], []
    count = sum(map(len, by_chr.values()))
    for chrom, seq in fasta(fa):
        for gid, symbol, biotype, start, end, strand in by_chr.pop(chrom, []):
            if symbol in main:
                excluded.append(symbol)
                continue
            if not (1 <= start <= end <= len(seq)) or strand not in ("+", "-"):
                raise ValueError("Invalid coordinate " + gid)
            lo, hi, bases = sample(seq, start, end, strand)
            # Tuple fields: ID, symbol, biotype, contig, gene start/end,
            # strand, sample start/end, exact reference sequence.
            genes.append([gid, symbol, biotype, chrom, start, end, strand, lo, hi, bases])
    if by_chr:
        raise ValueError("Missing reference contigs: " + str(list(by_chr)))
    if set(excluded) != main or len(excluded) != len(main):
        raise ValueError("Main campaign gene reconciliation failed: " + str(excluded))
    if len(genes) + len(excluded) != count:
        raise ValueError("Gene count mismatch")
    genes.sort(key=lambda g: (g[1].casefold(), g[0]))
    return {"release": RELEASE, "annotationUrl": BASE + GTF, "referenceUrl": BASE + FA,
            "annotationSha256": digest(gtf), "referenceSha256": digest(fa),
            "totalGenes": count, "mainGenes": len(excluded), "genes": genes}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=pathlib.Path, default=ROOT / "data/bonus-cache")
    parser.add_argument("--gtf", type=pathlib.Path)
    parser.add_argument("--fasta", type=pathlib.Path)
    args = parser.parse_args()
    if OUT.exists():
        existing = json.loads(OUT.read_text())
        if existing.get("release") == RELEASE and existing.get("totalGenes", 0) > 50000:
            print("Pinned bonus catalogue present:", existing["totalGenes"], "genes")
            return
    args.cache.mkdir(parents=True, exist_ok=True)
    gtf = args.gtf or download(GTF, args.cache)
    fa = args.fasta or download(FA, args.cache)
    manifest = json.loads((ROOT / "src/genomics/manifest.generated.json").read_text())
    pack = generate(gtf, fa, {g["symbol"] for g in manifest["included"]})
    if pack["totalGenes"] < 50000:
        raise ValueError("Incomplete primary assembly")
    OUT.write_text(json.dumps(pack, ensure_ascii=True, separators=(",", ":")) + "\n")
    print("Verified", pack["totalGenes"], "genes;", len(pack["genes"]), "bonus entries")

if __name__ == "__main__":
    main()

"""Build compact, independently verified CDS indices for the T2T bonus map.

Uses exactly the RefSeq Liftoff v5.3 GFF that was used to create .genome pack
gene boundaries. No DNA is changed; these are reference annotations only.
"""
import argparse
from collections import defaultdict
import gzip
import hashlib
import json
from pathlib import Path
from urllib.parse import unquote
from urllib.request import urlopen

GFF = "https://s3-us-west-2.amazonaws.com/human-pangenomics/T2T/CHM13/assemblies/annotation/chm13v2.0_RefSeq_Liftoff_v5.3.gff.gz"
REFERENCE = "T2T-CHM13v2.0+Y / GCA_009914755.4"
CHROMS = ["chr" + str(i) for i in range(1, 23)] + ["chrX", "chrY", "chrM"]


def attributes(s):
    return {unquote(k): unquote(v) for item in s.split(";")
            if "=" in item for k, v in [item.split("=", 1)]}


def build(source, destination):
    genes = {}
    transcripts = {}
    fragments = defaultdict(list)
    with gzip.open(source, "rt") as stream:
        for line in stream:
            if line.startswith("##FASTA"):
                break
            if not line.strip() or line.startswith("#"):
                continue
            fields = line.rstrip("\n").split("\t")
            if len(fields) != 9:
                raise ValueError("Invalid Liftoff GFF row")
            chrom, _, kind, begin, finish, _, strand, _, raw = fields
            if chrom not in CHROMS or strand not in ("+", "-"):
                continue
            start, end = int(begin) - 1, int(finish)
            if start < 0 or end <= start:
                raise ValueError("Invalid GFF coordinates")
            at = attributes(raw)
            fid = at.get("ID", "")
            if (kind in ("gene", "pseudogene", "ncRNA_gene") or kind.endswith("_gene")) and "Parent" not in at:
                if not fid:
                    raise ValueError("Missing gene ID")
                genes[(chrom, fid)] = [fid, at.get("gene", at.get("Name", fid)),
                                      at.get("gene_biotype", at.get("gene_type", at.get("biotype", kind))),
                                      start, end, strand]
            elif kind in ("mRNA", "transcript") and fid and at.get("Parent"):
                transcripts[fid] = (chrom, at["Parent"].split(",")[0], strand, at)
            elif kind == "CDS" and at.get("Parent"):
                for parent in at["Parent"].split(","):
                    fragments[parent].append((chrom, start, end, strand))

    bychrom = defaultdict(list)
    for transcript, parts in fragments.items():
        meta = transcripts.get(transcript)
        if not meta:
            continue
        chrom, gid, strand, attrs = meta
        gene = genes.get((chrom, gid))
        if not gene or gene[5] != strand or any(c != chrom or d != strand for c, _, _, d in parts):
            continue
        segments = sorted(set((start, end) for _, start, end, _ in parts), reverse=(strand == "-"))
        if not segments or any(a < gene[3] or b > gene[4] for a, b in segments):
            continue
        length = sum(b-a for a, b in segments)
        if not length:
            continue
        # Prefer a named RefSeq transcript; use longest coding isoform as the
        # documented representative. No claim that other isoforms are absent.
        tag = str(attrs.get("tag", "")) + " " + str(attrs.get("transcript", ""))
        mane = int("MANE" in tag)
        curated = int("NM_" in transcript)
        score = (mane, curated, length, -len(transcript), transcript)
        bychrom[(chrom, gid)].append((score, transcript, segments))

    destination.mkdir(parents=True, exist_ok=True)
    sha = hashlib.sha256(source.read_bytes()).hexdigest()
    total = 0
    for chrom in CHROMS:
        records = []
        for (c, gid), candidates in bychrom.items():
            if c != chrom:
                continue
            _, transcript, exons = max(candidates, key=lambda item: item[0])
            gene = genes[(chrom, gid)]
            records.append([*gene, transcript, [list(x) for x in exons]])
        records.sort(key=lambda g: (g[3], g[4], g[0]))
        total += len(records)
        payload = {"format": "GENOME-CDS-1", "reference": REFERENCE,
                   "annotationSha256": sha, "chromosome": chrom,
                   "genes": records}
        (destination / (chrom + ".json")).write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=True) + "\n")
        print(chrom, len(records), "representative coding transcripts", flush=True)
    if total < 15000:
        raise ValueError("Incomplete CDS annotation: only " + str(total) + " genes")
    print("Validated", total, "coding loci; GFF SHA-256", sha, flush=True)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--cache", type=Path, default=Path("data/bonus-cache"))
    p.add_argument("--out", type=Path, default=Path("public/cds-annotations"))
    args = p.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    source = args.cache / "chm13v2.0_RefSeq_Liftoff_v5.3.gff.gz"
    if not source.exists():
        temp = source.with_suffix(".download")
        with urlopen(GFF, timeout=150) as response, temp.open("wb") as output:
            while block := response.read(1024 * 1024):
                output.write(block)
        temp.replace(source)
    build(source, args.out)


if __name__ == "__main__":
    main()

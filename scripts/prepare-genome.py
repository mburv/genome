"""Create chromosome packs from the gap-free T2T-CHM13v2.0+Y reference.
Each pack: uint32 LE JSON length, UTF-8 JSON, 2-bit A/C/G/T payload, high bits first.
Source archive MD5 is published by the T2T consortium (analysis_set/README.txt).
"""
import argparse
import gzip
import hashlib
import json
import pathlib
import struct
import tempfile
import urllib.request
from collections import defaultdict
from urllib.parse import unquote

ROOT = "https://s3-us-west-2.amazonaws.com/human-pangenomics/T2T/CHM13/assemblies/"
FA = ROOT + "analysis_set/chm13v2.0.fa.gz"
GFF = ROOT + "annotation/chm13v2.0_RefSeq_Liftoff_v5.3.gff.gz"
MD5 = "06caded0055ec647a69acb708e13beff"
REFERENCE = "T2T-CHM13v2.0+Y / GCA_009914755.4"
CHUNK = 884736
LENGTHS = dict(zip(
    ["chr"+str(i) for i in range(1,23)]+["chrX","chrY","chrM"],
    [248387328,242696752,201105948,193574945,182045439,172126628,160567428,146259331,150617247,134758134,135127769,133324548,113566686,101161492,99753195,96330374,84276897,80542538,61707364,66210255,45090682,51324926,154259566,62460029,16569]))
TABLE = bytes.maketrans(b"ACGT",b"\x00\x01\x02\x03")

def download(url, target):
    if target.exists():
        return
    with urllib.request.urlopen(url,timeout=120) as r, target.with_suffix(".part").open("wb") as f:
        while chunk := r.read(1024*1024):
            f.write(chunk)
    target.with_suffix(".part").replace(target)

def digest(path, alg):
    with path.open("rb") as f:
        return hashlib.file_digest(f,alg).hexdigest()

def annotation(path):
    genes=defaultdict(list)
    seen=set()
    with gzip.open(path,"rt") as f:
        for line in f:
            if line.startswith("##FASTA"):
                break
            if line.startswith("#") or not line.strip():
                continue
            c,_,kind,a,b,_,strand,_,raw=line.rstrip("\n").split("\t")
            attrs=dict((k,unquote(v)) for item in raw.split(";") if "=" in item for k,v in [item.split("=",1)])
            if kind not in ("gene","pseudogene","ncRNA_gene") and not kind.endswith("_gene"):
                continue
            if "Parent" in attrs:
                continue
            gid=attrs.get("ID")
            if not gid or c not in LENGTHS or not 0<=int(a)-1<int(b)<=LENGTHS[c]:
                raise ValueError("Invalid gene annotation "+line[:200])
            key=(c,gid)
            if key in seen:
                raise ValueError("Duplicate locus "+str(key))
            seen.add(key)
            symbol=attrs.get("gene",attrs.get("Name",gid))
            biotype=attrs.get("gene_biotype",attrs.get("gene_type",attrs.get("biotype",kind)))
            genes[c].append([gid,symbol,biotype,int(a)-1,int(b),strand])
    if sum(map(len,genes.values()))<50000:
        raise ValueError("Incomplete gene annotation")
    for c in genes:
        genes[c].sort(key=lambda g:(g[3],g[4],g[0]))
    return genes

def pack_chunk(seq):
    if set(seq)-set(b"ACGT"):
        raise ValueError("Non-ACGT reference sequence")
    x=seq.translate(TABLE)
    x+=b"\0"*((-len(x))%4)
    # Four bases in one byte.
    return bytes((a<<6)|(b<<4)|(c<<2)|d for a,b,c,d in zip(x[::4],x[1::4],x[2::4],x[3::4]))

def make_packs(fa,gff,out):
    if digest(fa,"md5")!=MD5:
        raise ValueError("Reference archive checksum mismatch")
    genes=annotation(gff)
    ann_sha=digest(gff,"sha256")
    seen=set()
    chrom=None
    buffer=bytearray()
    hashes=[]
    length=0
    tmp=None
    def flush(final=False):
        nonlocal buffer,length
        while len(buffer)>=CHUNK or (final and buffer):
            n=min(CHUNK,len(buffer))
            data=pack_chunk(bytes(buffer[:n]))
            del buffer[:n]
            tmp.write(data)
            hashes.append(hashlib.sha256(data).hexdigest())
            length+=n
    def finish():
        if chrom is None:
            return
        flush(True)
        if chrom in seen or length!=LENGTHS[chrom]:
            raise ValueError("Wrong chromosome length "+str(chrom))
        seen.add(chrom)
        header={"format":"GENOME-T2T-1","reference":REFERENCE,"chromosome":chrom,"length":length,
                "annotation":"JHU RefSeq Liftoff v5.3","annotationSha256":ann_sha,"sourceMd5":MD5,
                "chunkBases":CHUNK,"genes":genes.get(chrom,[]),"chunkSha256":hashes}
        raw=json.dumps(header,separators=(",",":"),ensure_ascii=True).encode()
        tmp.seek(0)
        with (out/(chrom+".genome")).open("wb") as f:
            f.write(struct.pack("<I",len(raw)));f.write(raw)
            while chunk:=tmp.read(1024*1024):
                f.write(chunk)
        tmp.close()
        print(chrom,length,len(header["genes"]),"genes",flush=True)
    with gzip.open(fa,"rb") as f:
        for line in f:
            if line.startswith(b">"):
                finish()
                chrom=line[1:].split()[0].decode()
                if chrom not in LENGTHS:
                    raise ValueError("Unknown reference chromosome "+chrom)
                tmp=tempfile.TemporaryFile()
                buffer=bytearray();hashes=[];length=0
            else:
                buffer.extend(line.strip().upper())
                flush()
        finish()
    if seen!=set(LENGTHS):
        raise ValueError("Missing chromosomes "+str(set(LENGTHS)-seen))
    print("Verified",sum(LENGTHS.values()),"bases in",len(seen),"chromosomes",flush=True)

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--cache",type=pathlib.Path,default=pathlib.Path("data/bonus-cache"))
    p.add_argument("--out",type=pathlib.Path,default=pathlib.Path("genome-packs"))
    a=p.parse_args()
    a.cache.mkdir(parents=True,exist_ok=True);a.out.mkdir(parents=True,exist_ok=True)
    fa=a.cache/"chm13v2.0.fa.gz";gff=a.cache/"chm13v2.0_RefSeq_Liftoff_v5.3.gff.gz"
    download(FA,fa);download(GFF,gff);make_packs(fa,gff,a.out)
if __name__=="__main__":
    main()

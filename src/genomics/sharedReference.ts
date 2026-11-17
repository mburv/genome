import raw from './famous-t2t.generated.json' with {type:'json'};
export interface ReferenceCoding {
  chromosome:string;strand:'+'|'-';intervals:readonly (readonly [number,number])[];
  sequence:string;sequenceSha256:string;transcript:string;originalTranscript:string;reference:string;
}
export const FAMOUS_REFERENCE=raw as unknown as Readonly<Record<string,ReferenceCoding>>;
export const sharedDatasetId=(symbol:string):string=>'t2t-chm13v2.0-'+symbol+'-'+FAMOUS_REFERENCE[symbol]!.sequenceSha256.slice(0,12);

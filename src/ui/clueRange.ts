/** Shared Famous Genes clue-header metadata, regardless of puzzle mechanic.
 * CDS coordinates are one-based inclusive; end-start bases come from the
 * zero-based half-open interval of the reference coding sequence.
 */
export function formatGeneClueRange(
  symbol: string,
  start: number,
  end: number,
  blockSize?: number,
): string {
  return `${symbol} CDS ${start + 1}–${end} · ${end - start} bp${blockSize ? ` · ${blockSize}-base blocks` : ''}`;
}

import { CATALOGUE_SIZE, GENES } from '../genomics/genes.ts';

/** Shared How-to-play and About-the-DNA copy, shown in Settings. */
export function HelpSections() {
  return (
    <div className="settings-help" data-testid="settings-help">
      <details className="help" data-testid="help-how-to-play">
        <summary>How to play</summary>
        <p>Drag a tile left/right to slide its whole row segment with your finger, or up/down for its column segment — as far as you like. Let go and it snaps to the nearest cell; a quick flick moves one step. Tiles wrap around inside the segment. Dark gaps are holes: they split rows and columns and nothing crosses them.</p>
        <p><b>Sliding puzzle controls</b>: Undo reverses your last move, Hint highlights a useful move, and Restart resets the board. Each of the four sliding modes has its own animated guide, available from the question-mark button. Enzyme powers are available only in the separate optional Enzyme Lab, not campaign puzzles.</p>
        <p><b>Sequencing</b>: match the outlined strand. <b>Splicing</b>: match every numbered piece; they join in order. <b>Replication</b>: match the template strand and its aligned complement (A–T, C–G). <b>Repair</b>: match both sides of the marked gap; the missing base is restored when you win.</p>
        <p><b>Assembly chapters</b> (M4): tiles carry 3, 6, 12 or 24 real bases. Codons show all three letters, hexamers two rows of three, longer pieces their first and last codons separated by a thin line. The tile colour identifies the full fragment, which is also available in its accessible label. Tiles match by sequence, not by label; decoys are real pieces of the same gene from elsewhere.</p>
        <p>On a keyboard, arrow keys slide the selected tile and Shift + arrows move the selection. Hint gives a recovery drag towards a certified solution (not necessarily the shortest). Undo and Restart are free. No timers.</p>
      </details>
      <details className="help" data-testid="help-about-dna">
        <summary>About the DNA</summary>
        <p>Targets are slices of the first 51 coding bases of human <b>INS</b> (<a href={GENES.INS!.sourceUrl} target="_blank" rel="noopener noreferrer">{GENES.INS!.transcript}</a>) and <b>HBB</b> (<a href={GENES.HBB!.sourceUrl} target="_blank" rel="noopener noreferrer">{GENES.HBB!.transcript}</a>) from NCBI RefSeq (MANE Select), with verified length, frame, stop codon and translation. Reference sequences only — not anyone’s genome; no medical claims. Completing a gene’s six challenges discovers it; it is not assembled.</p>
        <p>The gene catalogue holds {CATALOGUE_SIZE} genes, each fetched from NCBI and verified as the MANE Select RefSeq transcript (start codon, single stop, translation equal to the record). Assembly chapters cover every coding base; a gene counts as assembled only when your reconstruction matches the reference exactly and its SHA-256 checksum matches.</p>
      </details>
    </div>
  );
}

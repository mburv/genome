import { useCallback, useMemo, useRef, useState } from 'react';
import { ALL_LEVELS, LAB_LEVELS, LEVEL_PACK, LEVELS } from '../campaign/campaign.ts';
import { CATALOGUE_SIZE, GENES } from '../genomics/genes.ts';
import { createLocalStorageAdapter, loadSave, newSave, serializeSave, type SaveData, type StorageAdapter } from '../persistence/save.ts';
import { GeneCard } from './GeneCard.tsx';
import { MapScreen } from './MapScreen.tsx';
import { PlayScreen } from './PlayScreen.tsx';
import { playHeading } from './playHeading.ts';
import { SettingsScreen } from './SettingsScreen.tsx';

const prefersReducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type Screen = { kind: 'map' } | { kind: 'play' } | { kind: 'card'; symbol: string } | { kind: 'settings' };

export function App({ storage = createLocalStorageAdapter() }: { storage?: StorageAdapter }) {
  const initial = useMemo(() => loadSave(storage, LEVEL_PACK), [storage]);
  const [save, setSave] = useState<SaveData>(initial.save);
  const [notices, setNotices] = useState<string[]>(initial.notices);
  // Write once on load (idempotent) so a fresh/migrated save is stored in the current format.
  const [saveOk, setSaveOk] = useState(() => storage.save(serializeSave(initial.save)));
  // First-time players go straight into the tutorial; returning players see the map.
  const [screen, setScreen] = useState<Screen>(() =>
    initial.save.completed.length === 0 && Object.keys(initial.save.attempts).length === 0 && initial.notices.length === 0 ? { kind: 'play' } : { kind: 'map' },
  );
  const systemReducedMotion = prefersReducedMotion();
  const reducedMotion = save.settings.reducedMotion || systemReducedMotion;

  const persist = useCallback(
    (next: SaveData) => {
      setSave(next);
      setSaveOk(storage.save(serializeSave(next)));
    },
    [storage],
  );

  const def = ALL_LEVELS.find((l) => l.id === save.currentLevelId) ?? LEVELS[0]!;
  const heading = playHeading(def);
  const settingsFrom = useRef<Screen>({ kind: 'map' });
  const go = (next: Screen) => {
    if (next.kind === 'settings' && screen.kind !== 'settings') settingsFrom.current = screen;
    setScreen(next);
    if (next.kind === 'play' || next.kind === 'map') window.scrollTo?.(0, 0);
  };
  const play = (levelId: string) => {
    persist({ ...save, currentLevelId: levelId });
    go({ kind: 'play' });
  };
  const resetProgress = () => {
    if (!confirm('Erase all GENOME progress on this device?')) return;
    storage.backup(serializeSave(save));
    persist(newSave(LEVEL_PACK));
    go({ kind: 'map' });
  };

  return (
    <main className="app">
      <header className={`top${screen.kind === 'play' ? ' play-top' : ''}`}>
        {screen.kind === 'play' ? (
          <div className="play-heading" data-testid="play-heading">
            <div className="play-title-row">
              <h1 data-testid="play-title">{heading.title}</h1>
              {(heading.progress || heading.fullName) && (
                <p className="play-detail" data-testid="play-detail">
                  {heading.progress && <span data-testid="play-progress">{heading.progress}</span>}
                  {heading.progress && heading.fullName && <span aria-hidden="true">{'\u00a0·\u00a0'}</span>}
                  {heading.fullName && <span className="play-fullname" data-testid="play-fullname">{heading.fullName}</span>}
                </p>
              )}
            </div>
            <p className="play-locus" data-testid="play-locus">{heading.locus}</p>
          </div>
        ) : (
          <div>
            <h1>GENOME</h1>
          </div>
        )}
        <div className="top-buttons">
          {screen.kind !== 'settings' && (
            <button type="button" className="map-button" onClick={() => go({ kind: 'settings' })} aria-label="Settings" data-testid="open-settings">⚙</button>
          )}
        </div>
      </header>

      {notices.length > 0 && (
        <div className="notice" role="alert" data-testid="notice">
          {notices.map((n) => <p key={n}>{n}</p>)}
          <button type="button" onClick={() => setNotices([])}>OK</button>
        </div>
      )}

      {screen.kind === 'map' && (
        <MapScreen
          levels={LEVELS}
          labs={LAB_LEVELS}
          completed={save.completed}
          attempted={Object.keys(save.attempts)}
          currentLevelId={save.currentLevelId}
          legacyM1={save.legacy.m1Completed}
          onPlay={play}
          onCard={(symbol) => go({ kind: 'card', symbol })}
        />
      )}
      {screen.kind === 'play' && (
        <PlayScreen
          key={def.id}
          def={def}
          save={save}
          persist={persist}
          reducedMotion={reducedMotion}
          onPlay={play}
          onMap={() => go({ kind: 'map' })}
          onCard={(symbol) => go({ kind: 'card', symbol })}
        />
      )}
      {screen.kind === 'settings' && (
        <SettingsScreen
          settings={save.settings}
          systemReducedMotion={systemReducedMotion}
          onChange={(settings) => persist({ ...save, settings })}
          onReset={resetProgress}
          onMap={() => go({ kind: 'map' })}
          onBack={() => go(settingsFrom.current)}
        />
      )}
      {screen.kind === 'card' && (
        <GeneCard gene={GENES[screen.symbol]!} completed={save.completed} levels={LEVELS} onPlay={play} onBack={() => go({ kind: 'map' })} />
      )}

      <details className="panel help">
        <summary>How to play</summary>
        <p>Drag a tile left/right to slide its whole row segment with your finger, or up/down for its column segment — as far as you like. Let go and it snaps to the nearest cell; a quick flick moves one step. Tiles wrap around inside the segment. Dark gaps are holes: they split rows and columns and nothing crosses them.</p>
        <p><b>Enzyme power-ups</b> (from level 4): <b>CRISPR</b> ⚡4 replaces one tile’s base; <b>Ligase</b> ⚡2 bonds a finished codon so it can’t be moved (release is free); <b>Scaffold</b> ⚡3 joins two segments across a 1–2 cell gap for 3 rotations. You start each level with ⚡2 and earn +1 for each reference codon you first complete with a normal move (max 9). Energy is level-local and resets on restart. Undo reverses powers and refunds them. Every level can be solved without powers.</p>
        <p><b>Sequencing</b>: match the outlined strand. <b>Splicing</b>: match every numbered piece; they join in order. <b>Replication</b>: match the template strand and its aligned complement (A–T, C–G). <b>Repair</b>: match both sides of the marked gap; the missing base is restored when you win.</p>
        <p><b>Assembly chapters</b> (M4): tiles carry 3, 6, 12 or 24 real bases. Codons show all three letters, hexamers two rows of three, longer pieces their first…last codon with a colour barcode and length. Tap a tile to read its full sequence under the board. Tiles match by sequence, not by label; decoys are real pieces of the same gene from elsewhere. CRISPR on a long tile changes one base you choose.</p>
        <p>Tap a tile and use the arrow buttons for single steps; on a keyboard, arrow keys slide the selected tile and Shift + arrows move the selection. Hint gives a recovery drag towards a certified solution (not necessarily the shortest). Undo and Restart are free. No timers.</p>
      </details>
      <details className="panel help">
        <summary>About the DNA</summary>
        <p>Targets are slices of the first 51 coding bases of human <b>INS</b> (<a href={GENES.INS!.sourceUrl} target="_blank" rel="noopener noreferrer">{GENES.INS!.transcript}</a>) and <b>HBB</b> (<a href={GENES.HBB!.sourceUrl} target="_blank" rel="noopener noreferrer">{GENES.HBB!.transcript}</a>) from NCBI RefSeq (MANE Select), with verified length, frame, stop codon and translation. Reference sequences only — not anyone’s genome; no medical claims. Completing a gene’s six challenges discovers it; it is not assembled.</p>
        <p>The gene catalogue holds {CATALOGUE_SIZE} genes, each fetched from NCBI and verified as the MANE Select RefSeq transcript (start codon, single stop, translation equal to the record). Assembly chapters cover every coding base; a gene counts as assembled only when your reconstruction matches the reference exactly and its SHA-256 checksum matches.</p>
      </details>
      <footer className="muted small">{saveOk ? 'Progress is saved on this device.' : 'Progress cannot be saved in this browser (storage unavailable).'} · M4 gene assembly</footer>
    </main>
  );
}

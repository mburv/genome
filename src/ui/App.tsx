import { useCallback, useMemo, useState } from 'react';
import { LEVEL_PACK, LEVELS } from '../campaign/campaign.ts';
import { GENES } from '../genomics/genes.ts';
import { createLocalStorageAdapter, loadSave, newSave, serializeSave, type SaveData, type StorageAdapter } from '../persistence/save.ts';
import { GeneCard } from './GeneCard.tsx';
import { MapScreen } from './MapScreen.tsx';
import { PlayScreen } from './PlayScreen.tsx';

const prefersReducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type Screen = { kind: 'map' } | { kind: 'play' } | { kind: 'card'; symbol: string };

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
  const reducedMotion = save.settings.reducedMotion || prefersReducedMotion();

  const persist = useCallback(
    (next: SaveData) => {
      setSave(next);
      setSaveOk(storage.save(serializeSave(next)));
    },
    [storage],
  );

  const def = LEVELS.find((l) => l.id === save.currentLevelId) ?? LEVELS[0]!;
  const play = (levelId: string) => {
    persist({ ...save, currentLevelId: levelId });
    setScreen({ kind: 'play' });
    window.scrollTo?.(0, 0);
  };
  const resetProgress = () => {
    if (!confirm('Erase all GENOME progress on this device?')) return;
    storage.backup(serializeSave(save));
    persist(newSave(LEVEL_PACK));
    setScreen({ kind: 'map' });
  };

  return (
    <main className="app">
      <header className="top">
        <div>
          <h1>GENOME</h1>
          <p className="tag">Build what makes you human</p>
        </div>
        {screen.kind !== 'map' && (
          <button type="button" className="map-button" onClick={() => setScreen({ kind: 'map' })} data-testid="open-map">☰ Map</button>
        )}
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
          completed={save.completed}
          attempted={Object.keys(save.attempts)}
          currentLevelId={save.currentLevelId}
          legacyM1={save.legacy.m1Completed}
          onPlay={play}
          onCard={(symbol) => setScreen({ kind: 'card', symbol })}
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
          onMap={() => setScreen({ kind: 'map' })}
          onCard={(symbol) => setScreen({ kind: 'card', symbol })}
        />
      )}
      {screen.kind === 'card' && (
        <GeneCard gene={GENES[screen.symbol]!} completed={save.completed} levels={LEVELS} onBack={() => setScreen({ kind: 'map' })} />
      )}

      <details className="panel help">
        <summary>How to play</summary>
        <p>Drag a tile left/right to slide its whole row segment with your finger, or up/down for its column segment — as far as you like. Let go and it snaps to the nearest cell; a quick flick moves one step. Tiles wrap around inside the segment. Dark gaps are holes: they split rows and columns and nothing crosses them.</p>
        <p><b>Sequencing</b>: match the outlined strand. <b>Splicing</b>: match every numbered piece; they join in order. <b>Replication</b>: match the template strand and its aligned complement (A–T, C–G). <b>Repair</b>: match both sides of the marked gap; the missing base is restored when you win.</p>
        <p>Tap a tile and use the arrow buttons for single steps; on a keyboard, arrow keys slide the selected tile and Shift + arrows move the selection. Hint gives a recovery drag towards a certified solution (not necessarily the shortest). Undo and Restart are free. No timers.</p>
      </details>
      <details className="panel help">
        <summary>About the DNA &amp; settings</summary>
        <p>Targets are slices of the first 51 coding bases of human <b>INS</b> (<a href={GENES.INS!.sourceUrl} target="_blank" rel="noopener noreferrer">{GENES.INS!.transcript}</a>) and <b>HBB</b> (<a href={GENES.HBB!.sourceUrl} target="_blank" rel="noopener noreferrer">{GENES.HBB!.transcript}</a>) from NCBI RefSeq (MANE Select), with verified length, frame, stop codon and translation. Reference sequences only — not anyone’s genome; no medical claims. Completing a gene’s six challenges discovers it; it is not assembled.</p>
        <label className="toggle">
          <input type="checkbox" checked={save.settings.reducedMotion} onChange={(e) => persist({ ...save, settings: { reducedMotion: e.target.checked } })} /> Reduce motion
        </label>
        <button type="button" className="link" onClick={resetProgress}>Reset progress</button>
      </details>
      <footer className="muted small">{saveOk ? 'Progress is saved on this device.' : 'Progress cannot be saved in this browser (storage unavailable).'} · M2 sample campaign</footer>
    </main>
  );
}

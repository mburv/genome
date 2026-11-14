import { useCallback, useMemo, useRef, useState } from 'react';
import { ALL_LEVELS, LAB_LEVELS, LEVEL_PACK, OPENING_LEVEL_ID } from '../campaign/campaign.ts';
import { GENES } from '../genomics/genes.ts';
import { clearProgressStorage, createLocalStorageAdapter, loadSave, resetProgress, serializeSave, type SaveData, type StorageAdapter } from '../persistence/save.ts';
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
  // First-time players go straight into the opening puzzle; returning players see the map. Reset lands on the map.
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

  const def = ALL_LEVELS.find((l) => l.id === save.currentLevelId) ?? ALL_LEVELS.find((l) => l.id === OPENING_LEVEL_ID)!;
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
  const applyReset = () => {
    const settings = save.settings;
    if (typeof localStorage !== 'undefined') clearProgressStorage(localStorage);
    persist(resetProgress(LEVEL_PACK, settings));
    setNotices([]);
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
          onReset={applyReset}
          onMap={() => go({ kind: 'map' })}
          onBack={() => go(settingsFrom.current)}
        />
      )}
      {screen.kind === 'card' && (
        <GeneCard gene={GENES[screen.symbol]!} completed={save.completed} onPlay={play} onBack={() => go({ kind: 'map' })} />
      )}

      <footer className="muted small">{saveOk ? 'Progress is saved on this device.' : 'Progress cannot be saved in this browser (storage unavailable).'} · M4 gene assembly</footer>
    </main>
  );
}

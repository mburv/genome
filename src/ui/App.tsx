import { useCallback, useMemo, useRef, useState } from 'react';
import { ALL_LEVELS, CAMPAIGN_LEVELS, LAB_LEVELS, LEVEL_PACK, OPENING_LEVEL_ID, runProgress, isDiscovered } from '../campaign/campaign.ts';
import { GENES } from '../genomics/genes.ts';
import { assemblyStatus } from '../campaign/assembly.ts';
import { mixedStage, verifiedMixed, type Mechanic } from '../campaign/mixed.ts';
import { MechanicTutorial } from './MechanicTutorial.tsx';
import { recordAssembly, recordCompletion, clearProgressStorage, createLocalStorageAdapter, loadSave, resetProgress, serializeSave, type SaveData, type StorageAdapter } from '../persistence/save.ts';
import { GeneCard } from './GeneCard.tsx';
import { MapScreen } from './MapScreen.tsx';
import { PlayScreen } from './PlayScreen.tsx';
import { playHeading } from './playHeading.ts';
import { SettingsScreen } from './SettingsScreen.tsx';
import { MechanicsMenu, MechanicsPlay } from './MechanicsLab.tsx';
import type { LabAction, LabId, LabState } from '../engine/mechanicsLab.ts';
import { TitleScreen } from './TitleScreen.tsx';

const prefersReducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type Screen = { kind: 'title' } | { kind: 'map' } | { kind: 'play' } | { kind: 'card'; symbol: string } | { kind: 'settings' } | { kind: 'mechanics' } | { kind: 'mechanic'; id: LabId };

export function App({ storage = createLocalStorageAdapter() }: { storage?: StorageAdapter }) {
  const initial = useMemo(() => loadSave(storage, LEVEL_PACK), [storage]);
  const [save, setSave] = useState<SaveData>(initial.save);
  const saveRef = useRef(initial.save);
  const [classic, setClassic] = useState(() => typeof location !== 'undefined' && new URLSearchParams(location.search).get('classic') === '1');
  const [tutorial, setTutorial] = useState<Mechanic | null>(null);
  const [notices, setNotices] = useState<string[]>(initial.notices);
  // Write once on load (idempotent) so a fresh/migrated save is stored in the current format.
  const [saveOk, setSaveOk] = useState(() => storage.save(serializeSave(initial.save)));
  // Every launch (fresh or returning) opens on the title screen. Play goes to the map.
  const [screen, setScreen] = useState<Screen>({ kind: 'title' });
  const systemReducedMotion = prefersReducedMotion();
  const reducedMotion = save.settings.reducedMotion || systemReducedMotion;
  // null preserves the introductory tutorial cue until the player explicitly chooses a mode.
  const [hintMode, setHintMode] = useState<boolean | null>(null);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const onPowerArmed = useCallback((armed: boolean) => setHeaderCollapsed(armed), []);

  const persist = useCallback(
    (next: SaveData) => {
      saveRef.current = next;
      setSave(next);
      setSaveOk(storage.save(serializeSave(next)));
    },
    [storage],
  );

  const def = ALL_LEVELS.find((l) => l.id === save.currentLevelId) ?? ALL_LEVELS.find((l) => l.id === OPENING_LEVEL_ID)!;
  const labTrace = screen.kind === 'mechanic' && screen.id === 'trace';
  const playChrome = screen.kind === 'play' || labTrace;
  const heading = labTrace ? { ...playHeading(ALL_LEVELS.find(l=>l.id==='ins-01')!), progress:'PRACTICE' } : playHeading(def);
  const stage = useMemo(() => mixedStage(def), [def]);
  const useMixed = !!stage && !classic && (!!save.mixedAttempts?.[def.id] || !save.attempts[def.id] || save.completed.includes(def.id));
  const activeMechanic: Mechanic | null = screen.kind === 'play' ? useMixed ? stage!.mechanic : 'slide' : screen.kind === 'mechanic' ? screen.id : null;
  const firstTutorial = activeMechanic && !save.tutorialsSeen?.includes(activeMechanic) ? activeMechanic : null;
  const shownTutorial = tutorial ?? firstTutorial;
  const closeTutorial = () => {
    if (shownTutorial && !saveRef.current.tutorialsSeen?.includes(shownTutorial)) persist({ ...saveRef.current, tutorialsSeen: [...(saveRef.current.tutorialsSeen ?? []), shownTutorial] });
    setTutorial(null);
  };
  const mixedProgress = useCallback((actions: readonly LabAction[], state: LabState) => {
    if (!stage) return;
    let next = saveRef.current;
    const prior = next.mixedAttempts?.[stage.id] ?? [];
    if (JSON.stringify(prior) !== JSON.stringify(actions)) next = { ...next, mixedAttempts: { ...next.mixedAttempts, [stage.id]: [...actions] } };
    if (verifiedMixed(stage, state)) {
      next = recordCompletion(next, stage.id);
      if (isDiscovered(next.completed, 'INS') && !next.discovered.includes('INS')) next = { ...next, discovered: [...next.discovered, 'INS'] };
      next = recordAssembly(next, 'INS');
    }
    if (next !== saveRef.current) persist(next);
  }, [stage, persist]);
  const settingsFrom = useRef<Screen>({ kind: 'title' });
  const go = (next: Screen) => {
    setTutorial(null);
    if (next.kind === 'settings' && screen.kind !== 'settings') settingsFrom.current = screen;
    if (next.kind !== 'play') setHeaderCollapsed(false);
    setScreen(next);
    if (next.kind === 'play' || next.kind === 'map' || next.kind === 'title' || next.kind === 'mechanics' || next.kind === 'mechanic') window.scrollTo?.(0, 0);
  };
  const play = (levelId: string) => {
    persist({ ...saveRef.current, currentLevelId: levelId });
    go({ kind: 'play' });
  };
  const applyReset = () => {
    const settings = save.settings;
    if (typeof localStorage !== 'undefined') clearProgressStorage(localStorage);
    persist(resetProgress(LEVEL_PACK, settings));
    setNotices([]);
    setHintMode(null);
    go({ kind: 'title' });
  };

  return (
    <main className={`app${reducedMotion ? ' reduced-motion' : ''}${screen.kind === 'title' ? ' on-title' : ''}`}>
      {screen.kind !== 'title' && (
      <header className={`top${playChrome ? ' play-top' : ''}${headerCollapsed ? ' collapsed' : ''}`} data-testid={playChrome ? 'play-top' : 'app-top'}>
        <div className="top-collapse">
          <div className="top-collapse-inner" aria-hidden={headerCollapsed || undefined} inert={headerCollapsed || undefined}>
            {playChrome ? (
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
              {activeMechanic && <button type="button" className="map-button" aria-label="Show mechanic tutorial" data-testid="show-tutorial" onClick={() => setTutorial(activeMechanic)}>?</button>}
              {screen.kind !== 'settings' && (
                <button type="button" className="map-button" onClick={() => go({ kind: 'settings' })} aria-label="Settings" data-testid="open-settings">⚙</button>
              )}
            </div>
          </div>
        </div>
      </header>
      )}

      {notices.length > 0 && (
        <div className="notice" role="alert" data-testid="notice">
          {notices.map((n) => <p key={n}>{n}</p>)}
          <button type="button" onClick={() => setNotices([])}>OK</button>
        </div>
      )}

      {screen.kind === 'title' && (
        <TitleScreen onPlay={() => go({ kind: 'map' })} onSettings={() => go({ kind: 'settings' })} />
      )}
      {screen.kind === 'map' && (
        <MapScreen
          labs={LAB_LEVELS}
          completed={save.completed}
          attempted={[...Object.keys(save.attempts), ...Object.keys(save.mixedAttempts ?? {})]}
          classic={classic}
          onClassic={setClassic}
          currentLevelId={save.currentLevelId}
          legacyM1={save.legacy.m1Completed}
          onPlay={play}
          onMechanics={() => go({ kind: 'mechanics' })}
          onCard={(symbol) => go({ kind: 'card', symbol })}
        />
      )}
      {screen.kind === 'mechanics' && <MechanicsMenu onPlay={id => go({ kind: 'mechanic', id })} onBack={() => go({ kind: 'map' })} />}
      {screen.kind === 'mechanic' && <MechanicsPlay key={screen.id} id={screen.id} reducedMotion={reducedMotion} onBack={() => go({ kind: 'mechanics' })} onNext={id => go({ kind: 'mechanic', id })} />}
      {screen.kind === 'play' && useMixed && stage && <MechanicsPlay key={def.id} id={stage.mechanic} reducedMotion={reducedMotion} hintMode={hintMode} onHintModeChange={setHintMode} onBack={() => go({ kind: 'map' })} onNext={() => undefined} campaign={{
        def, completed: save.completed.includes(def.id), onCard: () => go({ kind: 'card', symbol: def.symbol }), hasNext: CAMPAIGN_LEVELS.findIndex(l => l.id === def.id) < CAMPAIGN_LEVELS.length - 1,
        stage, initialActions: save.mixedAttempts?.[def.id] ?? [], part: runProgress(def)!.part, of: runProgress(def)!.of,
        covered: assemblyStatus(save.completed, GENES.INS!).covered, assembled: assemblyStatus(save.completed, GENES.INS!).verified,
        onProgress: mixedProgress, onNext: () => { const next = CAMPAIGN_LEVELS[CAMPAIGN_LEVELS.findIndex(l => l.id === def.id) + 1]; if (next) play(next.id); else go({ kind: 'map' }); }
      }} />}
      {screen.kind === 'play' && !useMixed && (
        <PlayScreen
          key={def.id}
          def={def}
          save={save}
          persist={persist}
          reducedMotion={reducedMotion}
          onPlay={play}
          onMap={() => go({ kind: 'map' })}
          onCard={(symbol) => go({ kind: 'card', symbol })}
          onPowerArmed={onPowerArmed}
          hintMode={hintMode}
          onHintModeChange={setHintMode}
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

      {shownTutorial && <MechanicTutorial key={shownTutorial} mechanic={shownTutorial} stage={useMixed && screen.kind === 'play' ? stage : null} reducedMotion={reducedMotion} onClose={closeTutorial} />}
      {screen.kind !== 'title' && (
        <footer className="muted small">{saveOk ? 'Progress is saved on this device.' : 'Progress cannot be saved in this browser (storage unavailable).'} · M4 gene assembly</footer>
      )}
    </main>
  );
}

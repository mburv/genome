import { useCallback, useMemo, useRef, useState } from 'react';
import { ALL_LEVELS, CAMPAIGN_LEVELS, LEVEL_PACK, OPENING_LEVEL_ID, runProgress, isDiscovered } from '../campaign/campaign.ts';
import { GENES } from '../genomics/genes.ts';
import { assemblyStatus } from '../campaign/assembly.ts';
import { mechanicOf, mixedStage, verifiedMixed, slidingTutorial, type TutorialId } from '../campaign/mixed.ts';
import { MechanicTutorial } from './MechanicTutorial.tsx';
import { recordAssembly, recordCompletion, recordGenomeProgress, clearProgressStorage, createLocalStorageAdapter, loadSave, resetProgress, serializeSave, type SaveData, type StorageAdapter } from '../persistence/save.ts';
import { GeneCard } from './GeneCard.tsx';
import { MapScreen } from './MapScreen.tsx';
import { PlayScreen } from './PlayScreen.tsx';
import { playHeading } from './playHeading.ts';
import { SettingsScreen } from './SettingsScreen.tsx';
import { MechanicsMenu, MechanicsPlay } from './MechanicsLab.tsx';
import type { LabAction, LabId, LabState } from '../engine/mechanicsLab.ts';
import { TitleScreen } from './TitleScreen.tsx';
import { BonusScreen } from './BonusScreen.tsx';
import { ClueSizing } from './ClueSizing.tsx';
import { bonusUnlocked, type BonusProgress } from '../campaign/bonus.ts';

const prefersReducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type Screen = { kind: 'title' } | { kind: 'map' } | { kind: 'play' } | { kind: 'card'; symbol: string; nextLevelId?: string | undefined; completion?: boolean } | { kind: 'settings' } | { kind: 'mechanics' } | { kind: 'mechanic'; id: LabId } | {kind:'bonus'};

export function App({ storage = createLocalStorageAdapter() }: { storage?: StorageAdapter }) {
  const initial = useMemo(() => loadSave(storage, LEVEL_PACK), [storage]);
  const [save, setSave] = useState<SaveData>(initial.save);
  const progressed=[...save.completed,...(save.legacyReferenceLevels??[])];
  const saveRef = useRef(initial.save);
  const [tutorial, setTutorial] = useState<TutorialId | null>(null);
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
  const [bonusPlaying,setBonusPlaying]=useState(false);
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
  const labPlay = screen.kind === 'mechanic';
  const playChrome = screen.kind === 'play' || labPlay;
  const heading = labPlay ? { ...playHeading(ALL_LEVELS.find(l=>l.id==='ins-01')!), progress:'PRACTICE' } : playHeading(def);
  const stage = useMemo(() => mixedStage(def), [def]);
  const useMixed = !!stage;
  // Completed legacy sliding alternatives retain their credit. Display the canonical
  // solved mixed puzzle when no mixed log exists; replays still award no new bases.
  const mixedActions = save.mixedAttempts?.[def.id] ?? (stage && save.completed.includes(def.id) ? stage.certificate : []);
  const activeMechanic: TutorialId | null = screen.kind === 'play' ? useMixed ? stage!.mechanic : slidingTutorial(def.mode) : screen.kind === 'mechanic' ? screen.id : null;
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
    if (stage.mechanic === 'trace' && state.traceStarter > 0 && !next.traceStarterAttempts?.includes(stage.id)) {
      next = { ...next, traceStarterAttempts: [...(next.traceStarterAttempts ?? []), stage.id], mixedAttempts: { ...next.mixedAttempts, [stage.id]: [...actions] } };
    }
    if (verifiedMixed(stage, state)) {
      next = recordCompletion(next, stage.id);
      if (isDiscovered(next.completed, stage.symbol) && !next.discovered.includes(stage.symbol)) next = { ...next, discovered: [...next.discovered, stage.symbol] };
      next = recordAssembly(next, stage.symbol);
    }
    if (next !== saveRef.current) persist(next);
  }, [stage, persist]);
  const persistBonus=useCallback((bonusProgress:BonusProgress)=>{if(bonusUnlocked([...saveRef.current.completed,...(saveRef.current.legacyReferenceLevels??[])]))persist(recordGenomeProgress(saveRef.current,bonusProgress));},[persist]);
  const settingsFrom = useRef<Screen>({ kind: 'title' });
  const go = (next: Screen) => {
    setTutorial(null);
    if (next.kind === 'settings' && screen.kind !== 'settings') settingsFrom.current = screen;
    if (next.kind !== 'play') setHeaderCollapsed(false);
    if(next.kind!=='bonus')setBonusPlaying(false);
    setScreen(next);
    if (next.kind === 'play' || next.kind === 'map' || next.kind === 'title' || next.kind === 'mechanics' || next.kind === 'mechanic') window.scrollTo?.(0, 0);
  };
  const play = (levelId: string) => {
    persist({ ...saveRef.current, currentLevelId: levelId });
    go({ kind: 'play' });
  };
  // Completion cards use the same gene detail as the catalogue, but carry the
  // next unfinished campaign level so a gene milestone never interrupts progression.
  const openCompletionCard = (symbol: string) => {
    const index = CAMPAIGN_LEVELS.findIndex(l => l.id === def.id);
    const done = new Set([...saveRef.current.completed,...(saveRef.current.legacyReferenceLevels??[])]);
    const next = CAMPAIGN_LEVELS.slice(index + 1).find(l => !done.has(l.id));
    go({ kind: 'card', symbol, nextLevelId: next?.id, completion: true });
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
      {screen.kind !== 'title' && !(screen.kind==='bonus'&&bonusPlaying) && (
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
          completed={save.completed}
          genomeProgress={save.genomeProgress??{}}
          historicalCompleted={save.legacyReferenceLevels??[]}
          attempted={[...Object.keys(save.attempts).filter(id=>{const level=ALL_LEVELS.find(l=>l.id===id);return level && mechanicOf(level)==='slide';}), ...Object.keys(save.mixedAttempts ?? {})]}
          currentLevelId={save.currentLevelId}
          legacyM1={save.legacy.m1Completed}
          onPlay={play}
          onMechanics={() => go({ kind: 'mechanics' })}
          onBonus={() => {if(bonusUnlocked([...saveRef.current.completed,...(saveRef.current.legacyReferenceLevels??[])]))go({kind:'bonus'});}}
          onCard={(symbol) => go({ kind: 'card', symbol })}
        />
      )}
      {screen.kind==='bonus' && bonusUnlocked(progressed) && <BonusScreen feedback={save.settings} progress={save.genomeProgress??{}} onProgress={persistBonus} reducedMotion={reducedMotion} onPlaying={setBonusPlaying} onSettings={()=>go({kind:'settings'})} onBack={()=>go({kind:'map'})}/>}
      {screen.kind === 'mechanics' && <MechanicsMenu onPlay={id => go({ kind: 'mechanic', id })} onBack={() => go({ kind: 'map' })} />}
      {screen.kind === 'mechanic' && <MechanicsPlay feedback={save.settings} key={screen.id} id={screen.id} reducedMotion={reducedMotion} onBack={() => go({ kind: 'mechanics' })} onNext={id => go({ kind: 'mechanic', id })} />}
      {screen.kind === 'play' && useMixed && stage && <MechanicsPlay feedback={save.settings} key={def.id} id={stage.mechanic} reducedMotion={reducedMotion} hintMode={hintMode} onHintModeChange={setHintMode} onBack={() => go({ kind: 'map' })} onNext={() => undefined} campaign={{
        def, completed: save.completed.includes(def.id), onCard: () => openCompletionCard(def.symbol), hasNext: CAMPAIGN_LEVELS.findIndex(l => l.id === def.id) < CAMPAIGN_LEVELS.length - 1,
        stage, initialActions: mixedActions, seedTrace: !save.mixedAttempts?.[def.id]?.length || !!save.traceStarterAttempts?.includes(def.id), part: runProgress(def)!.part, of: runProgress(def)!.of,
        covered: assemblyStatus(save.completed, GENES[def.symbol]!).covered, assembled: assemblyStatus(save.completed, GENES[def.symbol]!).verified,
        onProgress: mixedProgress, onNext: () => { const next = CAMPAIGN_LEVELS.slice(CAMPAIGN_LEVELS.findIndex(l => l.id === def.id) + 1).find(l=>!saveRef.current.legacyReferenceLevels?.includes(l.id)); if (next) play(next.id); else go({ kind: 'map' }); }
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
          onCard={openCompletionCard}
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
        <GeneCard gene={GENES[screen.symbol]!} completed={save.completed} historicalCompleted={save.legacyReferenceLevels??[]} onPlay={play} onBack={() => go({ kind: 'map' })} completion={screen.completion ?? false} onContinue={screen.nextLevelId ? () => play(screen.nextLevelId!) : undefined} nextGene={CAMPAIGN_LEVELS.find(l=>l.id===screen.nextLevelId)?.symbol} />
      )}

      <ClueSizing active={playChrome || bonusPlaying}/>
      {shownTutorial && <MechanicTutorial key={shownTutorial} mechanic={shownTutorial} stage={useMixed && screen.kind === 'play' ? stage : null} reducedMotion={reducedMotion} onClose={closeTutorial} />}
      {screen.kind !== 'title' && (
        <footer className="muted small">{saveOk ? 'Progress is saved on this device.' : 'Progress cannot be saved in this browser (storage unavailable).'} · {screen.kind==='bonus'?'Human Genome bonus':'Famous Genes'}</footer>
      )}
    </main>
  );
}

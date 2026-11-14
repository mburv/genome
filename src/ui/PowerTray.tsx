import { ENERGY_CAP, POWER_COST, POWERS, type Scaffold } from '../engine/powers.ts';
import type { Base, Power } from '../engine/types.ts';
import { IconBolt, IconCrispr, IconHint, IconLigase, IconRestart, IconScaffold, IconUndo } from './icons.tsx';

export const POWER_LABEL: Record<Power, string> = { crispr: 'CRISPR', ligase: 'Ligase', scaffold: 'Scaffold' };
export const POWER_ICON: Record<Power, string> = { crispr: '✂︎', ligase: '🔗', scaffold: '⌒' };
export const POWER_BLURB: Record<Power, string> = {
  crispr: 'Replace one tile’s base',
  ligase: 'Bond a finished codon in place',
  scaffold: 'Bridge a 1–2 cell gap for 3 rotations',
};

const POWER_GLYPH: Record<Power, typeof IconCrispr> = {
  crispr: IconCrispr,
  ligase: IconLigase,
  scaffold: IconScaffold,
};

interface TrayProps {
  energy: number;
  powersEnabled: boolean;
  freeUses: readonly Power[];
  locks: readonly number[];
  scaffold: Scaffold | null;
  active: Power | null;
  disabled: boolean;
  highlightRelease: boolean;
  onPick: (p: Power) => void;
  onRelease: () => void;
  canUndo: boolean;
  canRestart: boolean;
  onUndo: () => void;
  hintEnabled: boolean;
  onHint: () => void;
  onRestart: () => void;
}

/** Full-width energy meter + a six-icon action row (powers hidden on the opening puzzle). */
export function PowerTray({
  energy, powersEnabled, freeUses, locks, scaffold, active, disabled, highlightRelease,
  onPick, onRelease, canUndo, canRestart, onUndo, hintEnabled, onHint, onRestart,
}: TrayProps) {
  return (
    <section className="tray" aria-label={powersEnabled ? 'Enzyme power-ups' : 'Puzzle controls'} data-testid="power-tray">
      {powersEnabled && (
        <div className="energy" data-testid="energy" aria-label={`Energy ${energy} of ${ENERGY_CAP}`} title="Energy: +1 for each reference codon you first complete with a normal move. Level-local; resets on restart.">
          <span className="bolt" aria-hidden="true"><IconBolt /></span>
          <b>{energy}</b>
          <span className="pips" aria-hidden="true">{Array.from({ length: ENERGY_CAP }, (_, i) => <i key={i} className={i < energy ? 'on' : ''} />)}</span>
        </div>
      )}
      <div className="icon-row" data-testid="icon-row" role="toolbar" aria-label="Puzzle actions">
        {powersEnabled && POWERS.map((p) => {
          const free = freeUses.includes(p);
          const affordable = free || energy >= POWER_COST[p];
          const Glyph = POWER_GLYPH[p];
          return (
            <button
              key={p}
              type="button"
              className={`icon-btn power p-${p} ${active === p ? 'active' : ''} ${affordable ? '' : 'poor'}`}
              onClick={() => onPick(p)}
              disabled={disabled}
              aria-pressed={active === p}
              aria-label={`${POWER_LABEL[p]}: ${POWER_BLURB[p]}. ${free ? 'Free tutorial use' : `Costs ${POWER_COST[p]} energy`}`}
              title={`${POWER_LABEL[p]} — ${free ? 'Free tutorial use' : `⚡${POWER_COST[p]}`}`}
              data-testid={`power-${p}`}
            >
              <Glyph />
              <span className={`p-cost ${free ? 'free' : ''}`}>{free ? 'FREE' : `⚡${POWER_COST[p]}`}</span>
            </button>
          );
        })}
        <button type="button" className="icon-btn" onClick={onUndo} disabled={disabled || !canUndo} aria-label="Undo" title="Undo last move" data-testid="action-undo">
          <IconUndo />
        </button>
        <button type="button" className={`icon-btn hint-toggle${hintEnabled ? ' active' : ''}`} onClick={onHint} disabled={disabled} aria-label="Hint" aria-pressed={hintEnabled} title={hintEnabled ? 'Turn hints off' : 'Turn hints on'} data-testid="action-hint">
          <IconHint />
        </button>
        <button type="button" className="icon-btn" onClick={onRestart} disabled={disabled || !canRestart} aria-label="Restart" title="Restart this level" data-testid="action-restart">
          <IconRestart />
        </button>
      </div>
      {powersEnabled && (locks.length > 0 || scaffold) && (
        <div className="power-status">
          {locks.length > 0 && (
            <button type="button" className={`release ${highlightRelease ? 'pulse' : ''}`} onClick={onRelease} disabled={disabled} data-testid="release">
              🔗 Release bond <span className="free">free</span>
            </button>
          )}
          {scaffold && <span className="scaffold-chip" data-testid="scaffold-remaining">⌒ Scaffold: {scaffold.remaining} rotation{scaffold.remaining === 1 ? '' : 's'} left</span>}
        </div>
      )}
    </section>
  );
}

interface PanelProps {
  power: Power;
  title: string;
  detail?: string;
  costText: string;
  canConfirm: boolean;
  basePicker?: { current: Base; chosen: Base | null; onPick: (b: Base) => void } | undefined;
  /** M4 token levels: which base of the piece to edit. */
  posPicker?: { seq: string; chosen: number; onPick: (i: number) => void } | undefined;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Targeting + preview panel. Nothing changes (and nothing is spent) until Confirm. */
export function PowerPanel({ power, title, detail, costText, canConfirm, basePicker, posPicker, onConfirm, onCancel }: PanelProps) {
  return (
    <section className={`power-panel p-${power}`} aria-label={`${POWER_LABEL[power]} preview`} data-testid="power-panel">
      <div className="row-between">
        <b>{POWER_ICON[power]} {title}</b>
        <span className="muted small" data-testid="power-cost">{costText}</span>
      </div>
      {posPicker && (
        <div className="pos-picker" role="group" aria-label="Base of the piece to edit">
          {posPicker.seq.split('').map((b, i) => (
            <button key={i} type="button" className={`bl-${b} ${posPicker.chosen === i ? 'chosen' : ''}`} onClick={() => posPicker.onPick(i)} aria-pressed={posPicker.chosen === i} aria-label={`Base ${i + 1}: ${b}`} data-testid={`pos-${i}`}>
              {b}
            </button>
          ))}
        </div>
      )}
      {basePicker && (
        <div className="base-picker" role="group" aria-label="Replace with base">
          {(['A', 'T', 'C', 'G'] as Base[]).map((b) => (
            <button
              key={b}
              type="button"
              className={`b-${b} ${basePicker.chosen === b ? 'chosen' : ''}`}
              onClick={() => basePicker.onPick(b)}
              aria-pressed={basePicker.chosen === b}
              aria-label={b === basePicker.current ? `${b} (current base — no change)` : `Replace with ${b}`}
              data-testid={`base-${b}`}
            >
              {b}
              {b === basePicker.current && <small>now</small>}
            </button>
          ))}
        </div>
      )}
      {detail ? <p className="small preview-text" data-testid="power-preview">{detail}</p> : null}
      <div className="card-actions">
        <button type="button" onClick={onCancel} data-testid="power-cancel">Cancel</button>
        <button type="button" className="primary" onClick={onConfirm} disabled={!canConfirm} data-testid="power-confirm">Confirm</button>
      </div>
    </section>
  );
}

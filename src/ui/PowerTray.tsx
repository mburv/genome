import { ENERGY_CAP, POWER_COST, POWERS, type Scaffold } from '../engine/powers.ts';
import type { Base, Power } from '../engine/types.ts';

export const POWER_LABEL: Record<Power, string> = { crispr: 'CRISPR', ligase: 'Ligase', scaffold: 'Scaffold' };
export const POWER_ICON: Record<Power, string> = { crispr: '✂︎', ligase: '🔗', scaffold: '⌒' };
export const POWER_BLURB: Record<Power, string> = {
  crispr: 'Replace one tile’s base',
  ligase: 'Bond a finished codon in place',
  scaffold: 'Bridge a 1–2 cell gap for 3 rotations',
};

interface TrayProps {
  energy: number;
  freeUses: readonly Power[];
  locks: readonly number[];
  scaffold: Scaffold | null;
  active: Power | null;
  disabled: boolean;
  highlightRelease: boolean;
  onPick: (p: Power) => void;
  onRelease: () => void;
  notice?: string | undefined;
}

/** Energy meter + the three powers. Tapping an unaffordable power explains why (costs nothing). */
export function PowerTray({ energy, freeUses, locks, scaffold, active, disabled, highlightRelease, onPick, onRelease, notice }: TrayProps) {
  return (
    <section className="tray" aria-label="Enzyme power-ups" data-testid="power-tray">
      <div className="energy" data-testid="energy" aria-label={`Energy ${energy} of ${ENERGY_CAP}`} title="Energy: +1 for each reference codon you first complete with a normal move. Level-local; resets on restart.">
        <span className="bolt" aria-hidden="true">⚡</span>
        <b>{energy}</b>
        <span className="pips" aria-hidden="true">{Array.from({ length: ENERGY_CAP }, (_, i) => <i key={i} className={i < energy ? 'on' : ''} />)}</span>
      </div>
      <div className="powers">
        {POWERS.map((p) => {
          const free = freeUses.includes(p);
          const affordable = free || energy >= POWER_COST[p];
          return (
            <button
              key={p}
              type="button"
              className={`power p-${p} ${active === p ? 'active' : ''} ${affordable ? '' : 'poor'}`}
              onClick={() => onPick(p)}
              disabled={disabled}
              aria-pressed={active === p}
              aria-label={`${POWER_LABEL[p]}: ${POWER_BLURB[p]}. ${free ? 'Free tutorial use' : `Costs ${POWER_COST[p]} energy`}`}
              data-testid={`power-${p}`}
            >
              <span className="p-icon" aria-hidden="true">{POWER_ICON[p]}</span>
              <span className="p-name">{POWER_LABEL[p]}</span>
              <span className={`p-cost ${free ? 'free' : ''}`}>{free ? 'FREE' : `⚡${POWER_COST[p]}`}</span>
            </button>
          );
        })}
      </div>
      {notice && <p className="tray-note" data-testid="tray-note">{notice}</p>}
      {(locks.length > 0 || scaffold) && (
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
  detail: string;
  costText: string;
  error: string | null;
  canConfirm: boolean;
  basePicker?: { current: Base; chosen: Base | null; onPick: (b: Base) => void } | undefined;
  /** M4 token levels: which base of the piece to edit. */
  posPicker?: { seq: string; chosen: number; onPick: (i: number) => void } | undefined;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Targeting + preview panel. Nothing changes (and nothing is spent) until Confirm. */
export function PowerPanel({ power, title, detail, costText, error, canConfirm, basePicker, posPicker, onConfirm, onCancel }: PanelProps) {
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
      <p className="small preview-text" data-testid="power-preview">{detail}</p>
      {error && <p className="small warn" data-testid="power-error">{error}</p>}
      <div className="card-actions">
        <button type="button" onClick={onCancel} data-testid="power-cancel">Cancel</button>
        <button type="button" className="primary" onClick={onConfirm} disabled={!canConfirm} data-testid="power-confirm">Confirm</button>
      </div>
    </section>
  );
}

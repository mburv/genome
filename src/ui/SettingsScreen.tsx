import type { Settings } from '../persistence/save.ts';
import { hapticsSupported, playCue } from './feedback.ts';

interface Props {
  settings: Settings;
  systemReducedMotion: boolean;
  onChange: (s: Settings) => void;
  onReset: () => void;
  onMap: () => void;
  onBack: () => void;
}

export function SettingsScreen({ settings, systemReducedMotion, onChange, onReset, onMap, onBack }: Props) {
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  const haptics = hapticsSupported();
  return (
    <section className="panel settings" aria-labelledby="settings-title" data-testid="settings">
      <div className="row-between">
        <h2 id="settings-title" className="gene">Settings</h2>
        <button type="button" onClick={onBack}>Done</button>
      </div>
      <button type="button" className="settings-map" onClick={onMap} data-testid="open-map">Map</button>
      <label className="setting">
        <span>
          <b>Reduce motion</b>
          <small>Instant snaps and no celebration animations.{systemReducedMotion ? ' Your device already asks for reduced motion, so it is on regardless.' : ''}</small>
        </span>
        <input type="checkbox" role="switch" checked={settings.reducedMotion || systemReducedMotion} disabled={systemReducedMotion} onChange={(e) => set({ reducedMotion: e.target.checked })} data-testid="toggle-motion" />
      </label>
      <label className="setting">
        <span>
          <b>Sound effects</b>
          <small>Soft tones made on the device (Web Audio) — no downloads.</small>
        </span>
        <input type="checkbox" role="switch" checked={settings.sound} onChange={(e) => { set({ sound: e.target.checked }); if (e.target.checked) playCue('energy', { sound: true, haptics: false }); }} data-testid="toggle-sound" />
      </label>
      <label className="setting">
        <span>
          <b>Haptics</b>
          <small>{haptics ? 'Short vibrations on moves, powers and wins.' : 'This browser has no vibration support (e.g. Safari on iPhone); the setting is kept for supported devices.'}</small>
        </span>
        <input type="checkbox" role="switch" checked={settings.haptics} onChange={(e) => { set({ haptics: e.target.checked }); if (e.target.checked) playCue('power', { sound: false, haptics: true }); }} data-testid="toggle-haptics" />
      </label>
      <p className="muted small">Settings are saved on this device. No timers, accounts or tracking.</p>
      <button type="button" className="link" onClick={onReset}>Reset all progress…</button>
    </section>
  );
}

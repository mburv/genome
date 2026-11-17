import { useEffect, useRef, useState } from 'react';
import type { Settings } from '../persistence/save.ts';
import { hapticsSupported, playCue } from './feedback.ts';

interface Props {
  settings: Settings;
  systemReducedMotion: boolean;
  onChange: (s: Settings) => void;
  onReset: () => void;
  onMap: () => void;
}

export function SettingsScreen({ settings, systemReducedMotion, onChange, onReset, onMap }: Props) {
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  const haptics = hapticsSupported();
  const [confirming, setConfirming] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  return (
    <section className="panel settings" aria-labelledby="settings-title" data-testid="settings">
      <h2 id="settings-title" className="gene">Settings</h2>
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
      {!confirming ? (
        <button type="button" className="reset-trigger" onClick={() => setConfirming(true)} aria-expanded={false} aria-controls="reset-confirm" data-testid="reset-progress">
          Reset progress
        </button>
      ) : (
        <div
          className="reset-confirm"
          id="reset-confirm"
          role="dialog"
          aria-modal="false"
          aria-labelledby="reset-title"
          aria-describedby="reset-copy"
          data-testid="reset-confirm"
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setConfirming(false); } }}
        >
          <p id="reset-title" className="reset-title">Reset all progress?</p>
          <p id="reset-copy">This erases all level progress, stars, best scores and unlocks on this device. This cannot be undone. Your sound, haptics and reduced-motion settings are kept.</p>
          <div className="reset-actions">
            <button type="button" className="reset-cancel" ref={cancelRef} onClick={() => setConfirming(false)} data-testid="reset-cancel">Cancel</button>
            <button type="button" className="reset-go" onClick={onReset} data-testid="reset-confirm-btn">Reset</button>
          </div>
        </div>
      )}
    </section>
  );
}

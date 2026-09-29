import { memo, useEffect, useState, type ChangeEvent } from 'react';
import { BUFFER_SIZE, FLUSH_INTERVAL_MS, STREAM_RATE, type Range } from '../config.ts';
import { useDebouncedValue } from '../hooks/useDebouncedValue.ts';
import { useLiveSelector, useLiveStore } from '../hooks/useLiveSelector.ts';
import type { LiveSnapshot, Settings } from '../store/liveStore.ts';
import { clampInt, formatInteger } from '../utils/helpers.ts';

const selectSettings = (s: LiveSnapshot) => s.settings;

interface FieldConfig {
  readonly key: keyof Settings;
  readonly label: string;
  readonly unit: string;
  readonly range: Range;
  readonly step: number;
}

const FIELDS: readonly FieldConfig[] = [
  { key: 'bufferSize', label: 'Buffer size', unit: 'events', range: BUFFER_SIZE, step: 500 },
  { key: 'flushMs', label: 'Update throttle', unit: 'ms', range: FLUSH_INTERVAL_MS, step: 50 },
  { key: 'rate', label: 'Stream rate', unit: 'msg/s', range: STREAM_RATE, step: 1 },
];

// Applied after a short pause so dragging a slider does not resize buffers on every step.
const APPLY_DEBOUNCE_MS = 150;

export const SettingsPanel = memo(function SettingsPanel() {
  const store = useLiveStore();
  const applied = useLiveSelector(selectSettings);
  const [draft, setDraft] = useState<Settings>(applied);
  const debouncedDraft = useDebouncedValue(draft, APPLY_DEBOUNCE_MS);

  useEffect(() => {
    store.updateSettings(debouncedDraft);
  }, [store, debouncedDraft]);

  const handleChange = (field: FieldConfig) => (event: ChangeEvent<HTMLInputElement>) => {
    const value = clampInt(event.target.value, field.range.min, field.range.max, field.range.default);
    setDraft((prev) => ({ ...prev, [field.key]: value }));
  };

  return (
    <details className="settings">
      <summary className="settings__summary">Settings</summary>
      <div className="settings__body">
        {FIELDS.map((field) => (
          <label key={field.key} className="settings__field">
            <span className="settings__row">
              <span>{field.label}</span>
              <span className="settings__value">
                {formatInteger(draft[field.key])} {field.unit}
              </span>
            </span>
            <input
              type="range"
              min={field.range.min}
              max={field.range.max}
              step={field.step}
              value={draft[field.key]}
              onChange={handleChange(field)}
            />
          </label>
        ))}
      </div>
    </details>
  );
});

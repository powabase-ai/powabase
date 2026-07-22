

import { useEffect, useState } from "react";

interface KeyValuePair {
  key: string;
  value: string;
}

interface KeyValueEditorProps {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}

function pairsToObj(pairs: KeyValuePair[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const p of pairs) {
    if (p.key.trim()) obj[p.key.trim()] = p.value;
  }
  return obj;
}

function objToPairs(value: Record<string, string>): KeyValuePair[] {
  return Object.entries(value).map(([k, v]) => ({ key: k, value: v }));
}

function sameObj(a: Record<string, string>, b: Record<string, string>): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  return ak.length === bk.length && ak.every((k) => a[k] === b[k]);
}

export function KeyValueEditor({
  value,
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
}: KeyValueEditorProps) {
  // Hold row state LOCALLY. Deriving rows purely from `value` (as this component
  // used to) makes "+ Add pair" a permanent no-op: a freshly-added {key:'', ...}
  // row has an empty key, so it is filtered out of the emitted object before it
  // can ever render — the user can never get a blank row to type into, and no
  // header/token can ever be entered. Local state lets a transient blank/half-
  // typed row exist; we commit the filtered object to the parent on every edit.
  const [pairs, setPairs] = useState<KeyValuePair[]>(() => objToPairs(value));

  // Resync ONLY on EXTERNAL value changes (e.g. loading a different record).
  // Our own commits set `value` to exactly pairsToObj(pairs), so this is a
  // no-op after them and does not clobber an in-progress blank row.
  useEffect(() => {
    if (!sameObj(pairsToObj(pairs), value)) {
      setPairs(objToPairs(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commit = (next: KeyValuePair[]) => {
    setPairs(next);
    onChange(pairsToObj(next));
  };

  // Add a blank row LOCALLY only — do not commit (it would be filtered out).
  // It becomes real, and is committed, as soon as the user types a key.
  const addPair = () => {
    setPairs([...pairs, { key: "", value: "" }]);
  };

  const removePair = (index: number) => {
    commit(pairs.filter((_, i) => i !== index));
  };

  const updatePair = (index: number, field: "key" | "value", val: string) => {
    commit(pairs.map((p, i) => (i === index ? { ...p, [field]: val } : p)));
  };

  return (
    <div className="space-y-2">
      {pairs.map((pair, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input
            type="text"
            value={pair.key}
            onChange={(e) => updatePair(i, "key", e.target.value)}
            placeholder={keyPlaceholder}
            className="flex-1 px-3 py-1.5 bg-surface-200 border border-default rounded-md text-sm text-foreground placeholder-foreground-muted focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <input
            type="text"
            value={pair.value}
            onChange={(e) => updatePair(i, "value", e.target.value)}
            placeholder={valuePlaceholder}
            className="flex-1 px-3 py-1.5 bg-surface-200 border border-default rounded-md text-sm text-foreground placeholder-foreground-muted focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <button
            onClick={() => removePair(i)}
            className="text-foreground-muted hover:text-destructive-600 text-sm"
          >
            &times;
          </button>
        </div>
      ))}
      <button
        onClick={addPair}
        className="text-sm text-brand-600 hover:text-brand-600"
      >
        + Add pair
      </button>
    </div>
  );
}

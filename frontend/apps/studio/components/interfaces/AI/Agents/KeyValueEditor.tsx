

import { useState } from "react";

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

export function KeyValueEditor({
  value,
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
}: KeyValueEditorProps) {
  const pairs: KeyValuePair[] = Object.entries(value).map(([k, v]) => ({ key: k, value: v }));

  const updatePairs = (newPairs: KeyValuePair[]) => {
    const obj: Record<string, string> = {};
    for (const p of newPairs) {
      if (p.key.trim()) obj[p.key.trim()] = p.value;
    }
    onChange(obj);
  };

  const addPair = () => {
    updatePairs([...pairs, { key: "", value: "" }]);
  };

  const removePair = (index: number) => {
    updatePairs(pairs.filter((_, i) => i !== index));
  };

  const updatePair = (index: number, field: "key" | "value", val: string) => {
    const updated = pairs.map((p, i) => (i === index ? { ...p, [field]: val } : p));
    updatePairs(updated);
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

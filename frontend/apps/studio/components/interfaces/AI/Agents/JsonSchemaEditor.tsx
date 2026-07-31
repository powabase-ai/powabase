

import { useState, useEffect } from "react";

interface JsonSchemaEditorProps {
  value: Record<string, unknown> | null;
  onChange: (value: Record<string, unknown> | null) => void;
  placeholder?: string;
  /**
   * Fired whenever the on-screen text transitions between valid and invalid
   * JSON. WITHOUT this, a parse error only sets a local error message and does
   * NOT call onChange — so the parent silently keeps the last VALID value while
   * the user sees their invalid edit, and a "Save" that isn't gated on validity
   * persists the stale value and reports success (silent data loss). Parents
   * should disable Save while `valid` is false.
   */
  onValidityChange?: (valid: boolean) => void;
}

export function JsonSchemaEditor({ value, onChange, placeholder, onValidityChange }: JsonSchemaEditorProps) {
  const [text, setText] = useState(value ? JSON.stringify(value, null, 2) : "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(value ? JSON.stringify(value, null, 2) : "");
    // A value pushed in from the parent is by construction valid.
    setError(null);
    onValidityChange?.(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (raw: string) => {
    setText(raw);
    if (!raw.trim()) {
      setError(null);
      onValidityChange?.(true);
      onChange(null);
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      setError(null);
      onValidityChange?.(true);
      onChange(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON");
      onValidityChange?.(false);
    }
  };

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder ?? '{\n  "type": "object",\n  "properties": {}\n}'}
        rows={8}
        className="w-full px-3 py-2 bg-surface-200 border border-default rounded-md text-sm text-foreground font-mono placeholder-foreground-muted focus:outline-none focus:ring-2 focus:ring-brand-400 resize-y"
      />
      {error && <p className="text-xs text-destructive-600 mt-1">{error}</p>}
    </div>
  );
}

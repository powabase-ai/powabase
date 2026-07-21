

import { useState, useEffect } from "react";

interface JsonSchemaEditorProps {
  value: Record<string, unknown> | null;
  onChange: (value: Record<string, unknown> | null) => void;
  placeholder?: string;
}

export function JsonSchemaEditor({ value, onChange, placeholder }: JsonSchemaEditorProps) {
  const [text, setText] = useState(value ? JSON.stringify(value, null, 2) : "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(value ? JSON.stringify(value, null, 2) : "");
  }, [value]);

  const handleChange = (raw: string) => {
    setText(raw);
    if (!raw.trim()) {
      setError(null);
      onChange(null);
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      setError(null);
      onChange(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON");
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

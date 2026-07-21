

import { useMemo } from "react";

interface JsonSyntaxHighlightProps {
  data: unknown;
  className?: string;
}

/**
 * Simple JSON syntax highlighter component.
 * Renders JSON with color-coded keys, strings, numbers, booleans, and null values.
 */
export function JsonSyntaxHighlight({ data, className = "" }: JsonSyntaxHighlightProps) {
  const highlighted = useMemo(() => {
    const json = JSON.stringify(data, null, 2);
    if (!json) return "";

    // Escape HTML entities first
    let result = json
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Apply syntax highlighting
    // Keys (property names before colon)
    result = result.replace(/"([^"]+)":/g, '<span class="text-purple-400">"$1"</span>:');
    // String values (after colon, before comma or newline)
    result = result.replace(/: "([^"]*)"([,\n\r\]]?)/g, ': <span class="text-green-400">"$1"</span>$2');
    // Numbers (integers and floats)
    result = result.replace(/: (-?\d+\.?\d*)([,\n\r\]]?)/g, ': <span class="text-blue-400">$1</span>$2');
    // Booleans
    result = result.replace(/: (true|false)([,\n\r\]]?)/g, ': <span class="text-yellow-400">$1</span>$2');
    // Null values
    result = result.replace(/: (null)([,\n\r\]]?)/g, ': <span class="text-gray-500">$1</span>$2');

    return result;
  }, [data]);

  return (
    <pre
      className={`font-mono text-sm leading-relaxed whitespace-pre-wrap text-foreground ${className}`}
      dangerouslySetInnerHTML={{ __html: highlighted }}
    />
  );
}



import { Citation } from "@/lib/ai-api";
import { CitationBadge } from "@/components/CitationBadge";
import { MarkdownText } from "@/components/interfaces/AI/Shared/MarkdownText";

interface CitationTextProps {
  children: string;
  citations?: Citation[];
  className?: string;
  forceRaw?: boolean;
}

export function CitationText({
  children,
  citations,
  className,
  forceRaw,
}: CitationTextProps) {
  if (!citations || citations.length === 0) {
    return (
      <MarkdownText className={className} forceRaw={forceRaw}>
        {children}
      </MarkdownText>
    );
  }

  const citationMap = new Map(citations.map((c) => [c.key, c]));
  const parts = children.split(/(\[\d+\])/);

  return (
    <div className={className}>
      {parts.map((part, i) => {
        const match = part.match(/^\[(\d+)\]$/);
        if (match) {
          const cite = citationMap.get(match[1]);
          if (cite) {
            return <CitationBadge key={i} citation={cite} />;
          }
          return <span key={i}>{part}</span>;
        }
        if (!part) return null;
        return (
          <MarkdownText key={i} className="inline" forceRaw={forceRaw}>
            {part}
          </MarkdownText>
        );
      })}
    </div>
  );
}

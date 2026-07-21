import type { ReactNode } from "react";
import { useTypewriter, type TypewriterOptions } from "@/lib/use-typewriter";

interface Props {
  text: string;
  children: (visible: string) => ReactNode;
  options?: TypewriterOptions;
}

/**
 * Render-prop wrapper around useTypewriter. The component owns "what fraction
 * of `text` is currently visible"; the consumer's render-prop owns "how to
 * render that visible substring." This keeps citation rendering, markdown
 * parsing, etc. orthogonal to typewriter math.
 *
 * Composition example:
 *   <TypewriterStream text={fullContent} options={{ fastForward: !isStreaming }}>
 *     {(visible) => <CitationText forceRaw={isStreaming}>{visible}</CitationText>}
 *   </TypewriterStream>
 */
export function TypewriterStream({ text, children, options }: Props) {
  const visible = useTypewriter(text, options);
  return <>{children(visible)}</>;
}

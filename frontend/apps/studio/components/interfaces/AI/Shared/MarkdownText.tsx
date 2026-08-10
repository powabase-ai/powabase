

import { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import "katex/dist/katex.min.css";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { cn } from "@/lib/utils";
import { useMarkdownState, markdownState } from "@/state/markdown-state";

interface MarkdownTextProps {
  children: string;
  className?: string;
  /** Classes applied to the wrapper in raw mode (defaults to "whitespace-pre-wrap break-words") */
  rawClassName?: string;
  /** Force raw text display regardless of global toggle (useful during streaming) */
  forceRaw?: boolean;
  /**
   * Skip remark-math + rehype-katex. Use for user-uploaded document text
   * where a stray `$` (e.g. a dollar amount) would otherwise be parsed as a
   * math fence and KaTeX would strip word spacing inside the wrapped span.
   * Leave false for agent-generated content where LaTeX is intentional.
   */
  disableMath?: boolean;
}

// Sanitize schema: extend the default allowlist to preserve the classes our
// custom renderers rely on (code-highlighting `language-*`/hljs classes,
// KaTeX-generated classes) so rehype-sanitize doesn't strip them.
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code || []), "className"],
    span: [...(defaultSchema.attributes?.span || []), "className"],
    pre: [...(defaultSchema.attributes?.pre || []), "className"],
  },
};

export function MarkdownText({
  children,
  className,
  rawClassName = "whitespace-pre-wrap break-words",
  forceRaw,
  disableMath,
}: MarkdownTextProps) {
  const { renderMarkdown } = useMarkdownState();

  useEffect(() => {
    markdownState.initialize();
  }, []);

  const showRendered = renderMarkdown && !forceRaw;

  if (showRendered) {
    const remarkPlugins = disableMath ? [remarkGfm] : [remarkGfm, remarkMath];
    // rehype-sanitize runs AFTER rehypeRaw (so raw HTML is parsed then
    // cleaned) and BEFORE rehypeKatex (so KaTeX generates its trusted
    // output from already-sanitized text, and that output never needs to
    // be in the sanitize allowlist).
    // rehype-sanitize's tuple shape doesn't line up with react-markdown's
    // Pluggable typing (same pre-existing mismatch the rehypeKatex tuple
    // below works around via `as const`); `as any` sidesteps that.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rehypeSanitizePlugin = [rehypeSanitize, sanitizeSchema] as any;
    const rehypePlugins = disableMath
      ? [rehypeRaw, rehypeSanitizePlugin]
      : [rehypeRaw, rehypeSanitizePlugin, [rehypeKatex, { strict: "ignore" }] as const];
    return (
      <div className={cn("markdown-content break-words", className)}>
        <ReactMarkdown
          remarkPlugins={remarkPlugins}
          rehypePlugins={rehypePlugins}
          components={{
            code({ className: codeClassName, children: codeChildren, node: _node, ...rest }) {
              const match = /language-(\w+)/.exec(codeClassName || "");
              const codeString = String(codeChildren).replace(/\n$/, "");
              // Detect fenced code blocks: they have a language class set by ReactMarkdown
              // or are wrapped in <pre>. Inline code has no language class and no newlines.
              const isBlock = match || codeString.includes("\n");
              if (isBlock) {
                return (
                  <SyntaxHighlighter
                    style={oneDark}
                    language={match?.[1] ?? "text"}
                    PreTag="div"
                    customStyle={{
                      margin: 0,
                      borderRadius: "var(--radius-md)",
                      fontSize: "0.8125em",
                    }}
                  >
                    {codeString}
                  </SyntaxHighlighter>
                );
              }
              // react-markdown (via rehype-raw) can pass a non-DOM `inline` prop;
              // strip it so it isn't spread onto <code> — React warns "Received
              // true for a non-boolean attribute `inline`" and floods the console.
              const { inline: _inline, ...domProps } = rest as {
                inline?: boolean;
              } & Record<string, unknown>;
              return (
                <code className={codeClassName} {...domProps}>
                  {codeChildren}
                </code>
              );
            },
            pre({ children: preChildren }) {
              // Let the code component handle rendering; just pass through children
              return <>{preChildren}</>;
            },
          }}
        >
          {children}
        </ReactMarkdown>
      </div>
    );
  }

  return <div className={cn(rawClassName, className)}>{children}</div>;
}

import { useEffect, useState } from "react";
import { TypewriterStream } from "@/components/Shared/TypewriterStream";
import type { ReasoningStep, ReasoningPillState } from "@/lib/trace-utils";
import { cn } from "ui";

// Re-export so existing consumers that import from this component still work.
export type { ReasoningPillState };

interface Props {
  state: ReasoningPillState;
  steps: ReasoningStep[];
  durationMs: number | null;
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function PulsingDots() {
  return (
    <span className="relative inline-block h-3 w-3">
      <span className="absolute left-0 top-1 h-1 w-1 rounded-full bg-brand-400 animate-pulse" />
      <span
        className="absolute left-1.5 top-1 h-1 w-1 rounded-full bg-brand-400 animate-pulse"
        style={{ animationDelay: "150ms" }}
      />
      <span
        className="absolute right-0 top-1 h-1 w-1 rounded-full bg-brand-400 animate-pulse"
        style={{ animationDelay: "300ms" }}
      />
    </span>
  );
}

function StepEntry({ step }: { step: ReasoningStep }) {
  return (
    <div className="mb-3">
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-foreground-muted mb-1">
        Step {step.stepNumber}
      </h4>
      {step.isLive ? (
        <TypewriterStream text={step.reasoningText}>
          {(visible) => (
            <p className="whitespace-pre-wrap text-xs text-foreground-light">
              {visible}
            </p>
          )}
        </TypewriterStream>
      ) : (
        <p className="whitespace-pre-wrap text-xs text-foreground-light">
          {step.reasoningText}
        </p>
      )}
      {step.toolNames.length > 0 && (
        <div className="mt-1 text-xs text-foreground-muted space-y-0.5">
          {step.toolNames.map((name, i) => (
            <div key={i}>→ {name}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ReasoningPill({ state, steps, durationMs }: Props) {
  const [expanded, setExpanded] = useState(state === "streaming");

  // Sync expanded on state transitions; user clicks override after the transition.
  useEffect(() => {
    if (state === "streaming") setExpanded(true);
    else if (state === "done-full" || state === "done-empty" || state === "done-redacted") {
      setExpanded(false);
    }
  }, [state]);

  const stepCount = steps.length;
  const stepLabel = `${stepCount} step${stepCount !== 1 ? "s" : ""}`;

  return (
    <div
      className={cn(
        "mb-2 inline-flex flex-col self-start max-w-[90%]",
        "rounded-2xl rounded-bl-md",
        "border border-brand-400/25 bg-gradient-to-r from-brand-400/10 via-brand-400/5 to-transparent",
        "shadow-sm backdrop-blur-[1px]",
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="inline-flex items-center gap-2 px-3.5 py-2 text-left"
      >
        {(state === "pre-stream" || state === "streaming") && <PulsingDots />}
        {state === "pre-stream" && (
          <span className="text-sm font-medium">Thinking...</span>
        )}
        {state === "streaming" && (
          <span className="text-sm font-medium">
            Thinking... · {stepLabel}
          </span>
        )}
        {state === "done-full" && (
          <span className="text-sm font-medium">
            Thought for {formatDuration(durationMs)} · {stepLabel}
          </span>
        )}
        {state === "done-empty" && (
          <span className="text-sm font-medium">
            Thought for {formatDuration(durationMs)}
          </span>
        )}
        {state === "done-redacted" && (
          <span className="text-sm font-medium">
            Thought for {formatDuration(durationMs)} ·{" "}
            <span className="text-foreground-muted">redacted</span>
          </span>
        )}
      </button>
      {expanded && (state === "streaming" || state === "done-full" || state === "done-empty" || state === "done-redacted") && (
        <div className="border-t border-brand-400/15 px-3.5 py-2 max-h-64 overflow-y-auto">
          {state === "done-empty" && (
            <em className="text-xs text-foreground-muted">
              No reasoning summary returned by the model.
            </em>
          )}
          {state === "done-redacted" && (
            <em className="text-xs text-foreground-muted">
              Reasoning was generated but redacted by safety policy. The model
              still used it internally.
            </em>
          )}
          {(state === "streaming" || state === "done-full") &&
            steps.map((step) => <StepEntry key={step.stepNumber} step={step} />)}
        </div>
      )}
    </div>
  );
}

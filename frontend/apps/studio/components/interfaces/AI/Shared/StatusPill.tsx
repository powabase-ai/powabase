import { cn } from "@/lib/utils";

/**
 * Theme-aware status pill. Replaces the hardcoded `text-white` +
 * translucent-palette badges that were invisible in light mode (issue #80).
 * Maps a backend status string to a semantic tone rendered with CSS-variable
 * theme tokens, so it adapts to light and dark automatically.
 */

type Tone = "success" | "warning" | "destructive" | "progress" | "neutral";

// `progress` is the neutral surface plus a pulse to signal in-flight work; keep
// the shared base in one place so the two stay in sync.
const NEUTRAL_BASE = "bg-surface-200 text-foreground-light border border-strong";

const TONE_CLASSES: Record<Tone, string> = {
  success: "bg-brand-200 text-brand-600 border border-brand-300",
  warning: "bg-warning-200 text-warning-600 border border-warning-400",
  destructive: "bg-destructive-200 text-destructive-600 border border-destructive-300",
  progress: cn(NEUTRAL_BASE, "animate-pulse"),
  neutral: NEUTRAL_BASE,
};

const STATUS_TONE: Record<string, Tone> = {
  // in-progress
  extracting: "progress",
  indexing: "progress",
  enriching: "progress",
  // pending / needs-attention
  pending: "warning",
  attention_required: "warning",
  completed_with_errors: "warning",
  // success
  extracted: "success",
  indexed: "success",
  completed: "success",
  // error
  failed: "destructive",
  // neutral / terminal-inactive
  cancelled: "neutral",
  idle: "neutral",
};

/**
 * Maps a status string to its tone classes. Unrecognised statuses fall back to
 * the neutral tone. Exposed for unit tests and any ad-hoc styling reuse.
 */
export function statusToneClasses(status: string): string {
  return TONE_CLASSES[STATUS_TONE[status] ?? "neutral"];
}

export interface StatusPillProps {
  status: string;
  /**
   * When provided AND status === "failed", the pill becomes a button that opens
   * the failure-detail view (preserves prior KB-detail behavior).
   */
  onFailedClick?: () => void;
}

const BASE = "inline-flex items-center px-2 py-0.5 text-xs rounded-full font-medium";

export function StatusPill({ status, onFailedClick }: StatusPillProps) {
  const tone = statusToneClasses(status);

  if (status === "failed" && onFailedClick) {
    return (
      <button
        type="button"
        onClick={onFailedClick}
        className={cn(BASE, tone, "gap-1 hover:brightness-110 transition cursor-pointer")}
        title="View error details"
        aria-label="View error details"
      >
        {status}
        <svg className="w-3 h-3 opacity-80" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 3a1 1 0 011 1v4a1 1 0 11-2 0V5a1 1 0 011-1zm0 8a1 1 0 100 2 1 1 0 000-2z" />
        </svg>
      </button>
    );
  }

  return <span className={cn(BASE, tone)}>{status}</span>;
}

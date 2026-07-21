import { cn } from "ui"

// Small metric card used for the 5-card "health strip" at the top of
// each observability page. Tone maps to the severity of the number.

export type StatCardTone = "ok" | "warn" | "danger" | "neutral"

interface StatCardProps {
  label: string
  value: number | string | null | undefined
  tone?: StatCardTone
  hint?: string
  onClick?: () => void
  isLoading?: boolean
}

// Tailwind `red` / `amber` are remapped to Radix palettes in this repo's
// tailwind config, so named classes render muddy in dark mode. Use
// arbitrary hex (Tailwind canonical values) for the tone accents.
// See memory/project_tailwind_radix_remap.md.
const TONE_STYLES: Record<StatCardTone, { badge: string; value: string }> = {
  ok: {
    badge: "bg-emerald-400/20 border-emerald-400/40 text-emerald-200",
    value: "text-emerald-200",
  },
  warn: {
    badge: "bg-[#f59e0b]/25 border-[#fbbf24]/50 text-[#fef3c7]",
    value: "text-[#fef3c7]",
  },
  danger: {
    badge: "bg-[#ef4444]/25 border-[#f87171]/60 text-[#fee2e2]",
    value: "text-[#fee2e2]",
  },
  neutral: {
    badge: "bg-surface-200 border-default text-foreground-light",
    value: "text-foreground",
  },
}

export function StatCard({ label, value, tone = "neutral", hint, onClick, isLoading }: StatCardProps) {
  const styles = TONE_STYLES[tone]
  const displayValue = isLoading ? "…" : value ?? 0
  const interactive = !!onClick
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      className={cn(
        "flex flex-col gap-1 rounded-lg border p-4 text-left transition-colors",
        styles.badge,
        interactive ? "hover:brightness-110 cursor-pointer" : "cursor-default",
      )}
    >
      <span className="text-xs uppercase tracking-wider text-foreground-muted">{label}</span>
      <span className={cn("text-2xl font-semibold tabular-nums", styles.value)}>{displayValue}</span>
      {hint && <span className="text-xs text-foreground-muted">{hint}</span>}
    </button>
  )
}

import { Badge } from "ui"

/**
 * Shared farm-defense trust-state styling for the admin dashboard.
 *
 *   convicted → confirmed farm: projects paused + balance frozen (red)
 *   gated     → new / suspected: $2-capped, pending judge        (amber)
 *   trusted / null → fine                                        (neutral)
 *
 * Orgs carry `trust_state` directly; users carry a derived `flag_state`
 * (worst trust_state among the orgs they own, or null).
 */
export function flagRowClassName(state: string | null | undefined): string {
  if (state === "convicted") return "bg-destructive-200"
  if (state === "gated") return "bg-warning-200"
  return ""
}

export function FlagBadge({
  state,
  neutralLabel = "—",
}: {
  state: string | null | undefined
  /** Rendered when the account isn't flagged (trusted / none). */
  neutralLabel?: string
}) {
  if (state === "convicted") return <Badge variant="destructive">Convicted</Badge>
  if (state === "gated") return <Badge variant="warning">Gated</Badge>
  if (state === "trusted") return <Badge variant="brand">Trusted</Badge>
  return <span className="text-foreground-lighter">{neutralLabel}</span>
}

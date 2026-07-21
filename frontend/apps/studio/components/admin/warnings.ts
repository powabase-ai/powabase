import { toast } from "sonner"

/**
 * Surface a backend `warnings[]` partial-failure signal as a sticky warning
 * toast. Several admin mutations return 200 even when part of the work failed
 * (e.g. some project deprovisions/resumes failed, or a billing release blipped)
 * — leaving orphaned cluster state or a pending remainder the operator must
 * follow up on. These must NOT be swallowed by the green success toast, and
 * they must NOT auto-dismiss (the toast is the operator's only cleanup signal),
 * hence `duration: Infinity`.
 *
 * Shared by the org detail panel (OrgActionsPanel) and the orgs-list quick
 * toggle (admin/orgs/index) so both surfaces behave identically.
 */
export function surfaceWarnings(warnings?: string[]) {
  if (!warnings?.length) return
  toast.warning(
    `Completed with ${warnings.length} warning${warnings.length === 1 ? "" : "s"} — manual cleanup may be needed`,
    { description: warnings.join("\n"), duration: Infinity }
  )
}

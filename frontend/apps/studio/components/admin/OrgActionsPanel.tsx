import { useRouter } from "next/router"
import { useState } from "react"
import { toast } from "sonner"
import { Button, Input_Shadcn_ as Input } from "ui"
import { ConfirmationModal } from "ui-patterns/Dialogs/ConfirmationModal"

import { TextConfirmModal } from "@/components/ui/TextConfirmModalWrapper"
import {
  useAdminOrgDeleteMutation,
  useAdminOrgDrainMutation,
  useAdminOrgGrantMutation,
  useAdminOrgSetBalanceMutation,
  useAdminOrgTrustMutation,
} from "@/data/admin/use-admin-org-actions"
import { FlagBadge } from "./FlagBadge"
import { surfaceWarnings } from "./warnings"

/** $1 == 100_000 basis-point units (credits == millicents on this scale). */
const UNITS_PER_DOLLAR = 100_000

/**
 * Fat-finger guards for the grant input. The backend `admin_grant` has no
 * server-side ceiling (unlike `admin_set_balance`), so the UI is the only
 * brake: grants above the confirm threshold route through a modal, and grants
 * above the hard cap are blocked outright from the dashboard.
 */
const GRANT_CONFIRM_DOLLARS = 1_000
const GRANT_HARD_CAP_DOLLARS = 10_000

/** Parse a dollar string to integer units; null if not a valid amount ≥ 0. */
function dollarsToUnits(raw: string): number | null {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * UNITS_PER_DOLLAR)
}

type OpenModal = "none" | "suspend" | "drain" | "delete" | "grant"

/**
 * Platform-operator action panel for a single org. Wires the existing
 * `@require_platform_admin` endpoints: convict/release, grant, set-balance,
 * drain, delete. Destructive actions (suspend, drain, delete) are gated behind
 * a confirmation modal; delete additionally requires typing the slug.
 */
export function OrgActionsPanel({
  slug,
  trustState,
}: {
  slug: string
  trustState: string
}) {
  const router = useRouter()
  const [modal, setModal] = useState<OpenModal>("none")
  const [grantDollars, setGrantDollars] = useState("")
  const [balanceDollars, setBalanceDollars] = useState("")
  const [reason, setReason] = useState("")

  const trust = useAdminOrgTrustMutation()
  const drain = useAdminOrgDrainMutation()
  const del = useAdminOrgDeleteMutation()
  const grant = useAdminOrgGrantMutation()
  const setBalance = useAdminOrgSetBalanceMutation()

  const convicted = trustState === "convicted"
  const reasonOr = (fallback: string) => (reason.trim() ? reason.trim() : fallback)

  const submitGrant = () => {
    const amount = dollarsToUnits(grantDollars)
    if (amount === null || amount === 0) return
    grant.mutate(
      { slug, amount, reason: reasonOr("admin grant via dashboard") },
      {
        onSuccess: () => {
          toast.success(`Granted $${(amount / UNITS_PER_DOLLAR).toFixed(2)} to ${slug}`)
          setGrantDollars("")
          setModal("none")
        },
        onError: (e) => toast.error(e.message),
      }
    )
  }

  const onGrant = () => {
    const amount = dollarsToUnits(grantDollars)
    if (amount === null || amount === 0) return toast.error("Enter a dollar amount > 0")
    const dollars = amount / UNITS_PER_DOLLAR
    if (dollars > GRANT_HARD_CAP_DOLLARS)
      return toast.error(
        `Grants over $${GRANT_HARD_CAP_DOLLARS.toLocaleString()} are blocked from the dashboard.`
      )
    if (dollars > GRANT_CONFIRM_DOLLARS) return setModal("grant")
    submitGrant()
  }

  const onSetBalance = () => {
    const target = dollarsToUnits(balanceDollars)
    if (target === null) return toast.error("Enter a valid dollar amount (≥ 0)")
    setBalance.mutate(
      { slug, target_millicents: target, reason: reasonOr("admin set-balance via dashboard") },
      {
        onSuccess: (r) => {
          const dollars = `$${(r.new_balance_millicents / UNITS_PER_DOLLAR).toFixed(2)}`
          // Distinguish a real write from a no-op: an idempotent replay or a
          // zero applied delta means nothing was written (e.g. setting an
          // already-$0 org to $0), so don't imply a change happened.
          if (r.idempotent_replay || r.applied_delta_millicents === 0) {
            toast.info(`${slug} already at ${dollars} — no change`)
          } else {
            toast.success(`Balance set to ${dollars} for ${slug}`)
          }
          setBalanceDollars("")
        },
        onError: (e) => toast.error(e.message),
      }
    )
  }

  const onRestore = () =>
    trust.mutate(
      { slug, state: "trusted" },
      {
        onSuccess: (r) => {
          toast.success(`Restored ${slug}`)
          surfaceWarnings(r.warnings)
        },
        onError: (e) => toast.error(e.message),
      }
    )

  return (
    <div className="space-y-4">
      {/* Trust state */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-foreground-light">Trust state</span>
        <FlagBadge state={trustState} neutralLabel="Trusted" />
        {convicted ? (
          <Button type="default" loading={trust.isPending} onClick={onRestore}>
            Restore (trust)
          </Button>
        ) : (
          <Button type="warning" onClick={() => setModal("suspend")}>
            Suspend (convict)
          </Button>
        )}
      </div>

      {/* Credit controls */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-foreground-light w-40">
          Grant credits ($)
          <Input
            type="number"
            min="0"
            value={grantDollars}
            onChange={(e) => setGrantDollars(e.target.value)}
            placeholder="e.g. 10"
          />
        </label>
        <Button type="primary" loading={grant.isPending} onClick={onGrant}>
          Grant
        </Button>

        <label className="text-xs text-foreground-light w-40">
          Set balance to ($)
          <Input
            type="number"
            min="0"
            value={balanceDollars}
            onChange={(e) => setBalanceDollars(e.target.value)}
            placeholder="e.g. 0"
          />
        </label>
        <Button type="default" loading={setBalance.isPending} onClick={onSetBalance}>
          Set balance
        </Button>
      </div>

      <label className="block text-xs text-foreground-light max-w-md">
        Reason (optional — recorded for Grant and Set balance only)
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="reason" />
      </label>

      {/* Danger zone */}
      <div className="flex gap-2 pt-3 border-t border-border">
        <Button type="warning" loading={drain.isPending} onClick={() => setModal("drain")}>
          Drain to $0
        </Button>
        <Button type="danger" onClick={() => setModal("delete")}>
          Delete org
        </Button>
      </div>

      {/* Confirmations */}
      <ConfirmationModal
        visible={modal === "grant"}
        variant="warning"
        title={`Grant $${((dollarsToUnits(grantDollars) ?? 0) / UNITS_PER_DOLLAR).toLocaleString()} to ${slug}?`}
        confirmLabel="Grant"
        loading={grant.isPending}
        onCancel={() => setModal("none")}
        onConfirm={submitGrant}
        alert={{
          title: `This grants more than $${GRANT_CONFIRM_DOLLARS.toLocaleString()}.`,
          description: "Confirm the amount is correct — grants are not reversible from here.",
        }}
      />

      <ConfirmationModal
        visible={modal === "suspend"}
        variant="warning"
        title={`Suspend ${slug}?`}
        confirmLabel="Suspend"
        loading={trust.isPending}
        onCancel={() => setModal("none")}
        onConfirm={() =>
          trust.mutate(
            { slug, state: "convicted" },
            {
              onSuccess: (r) => {
                toast.success(`Suspended ${slug} — projects paused, balance frozen`)
                surfaceWarnings(r.warnings)
                setModal("none")
              },
              onError: (e) => toast.error(e.message),
            }
          )
        }
        alert={{
          title: "This pauses every project and freezes the org's credit balance.",
          description: "Reversible via Restore.",
        }}
      />

      <ConfirmationModal
        visible={modal === "drain"}
        variant="warning"
        title={`Drain ${slug} to $0?`}
        confirmLabel="Drain"
        loading={drain.isPending}
        onCancel={() => setModal("none")}
        onConfirm={() =>
          drain.mutate(
            { slug },
            {
              onSuccess: (r) => {
                toast.success(`Drained ${slug} (froze ${r.frozen_credits} credits)`)
                setModal("none")
              },
              onError: (e) => toast.error(e.message),
            }
          )
        }
        alert={{ title: "Posts one reversible debit that zeroes the on-us balance." }}
      />

      <TextConfirmModal
        visible={modal === "delete"}
        variant="destructive"
        title={`Delete ${slug}`}
        loading={del.isPending}
        confirmLabel="Delete organization"
        confirmPlaceholder="Type the org slug"
        confirmString={slug}
        text={
          <span>
            This deprovisions every project stack and permanently deletes the org.
          </span>
        }
        alert={{ title: "You cannot recover this organization once deleted." }}
        onCancel={() => setModal("none")}
        onConfirm={() =>
          del.mutate(
            { slug },
            {
              onSuccess: (r) => {
                toast.success(`Deleted ${slug}`)
                // The org row is gone but some project stacks may have failed
                // to deprovision (orphaned namespaces / Helm releases / EBS
                // volumes). Surface the backend warnings before navigating away
                // — this is the operator's only signal to clean them up.
                surfaceWarnings(r.warnings)
                setModal("none")
                router.push("/admin/orgs")
              },
              onError: (e) => toast.error(e.message),
            }
          )
        }
      />
    </div>
  )
}

import { Building2, FileCheck2, Headset, KeyRound, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  Alert_Shadcn_,
  AlertDescription_Shadcn_,
  AlertTitle_Shadcn_,
  Badge,
  Button,
  Modal,
} from 'ui'

import { ComputeTierCard } from '@/components/interfaces/Billing/ComputeTierCard'
import { ScaffoldContainer, ScaffoldSection } from '@/components/layouts/Scaffold'
import { COMPUTE_TIERS, ComputeTierId, PlanTierId } from '@/data/billing/compute-tiers.display'
import { useResizeComputeMutation } from '@/data/billing/resize-compute-mutation'
import { useIsBillingUiEnabled } from '@/hooks/misc/useIsBillingUiEnabled'
import { useSelectedOrganizationQuery } from '@/hooks/misc/useSelectedOrganization'
import { useSelectedProjectQuery } from '@/hooks/misc/useSelectedProject'

const tierById = (id: ComputeTierId) => COMPUTE_TIERS.find((t) => t.id === id)!

/**
 * Project Infrastructure — compute tier selection.
 *
 * Replaces the inconspicuous "Resize compute" button that previously lived on
 * the Project Overview header. Cards are arranged to give each tier room to
 * breathe: Sandbox on its own, then Builder/Workshop, then Studio/Foundry, and
 * finally an Enterprise managed-hosting option. Compute charts (CPU/RAM/Egress)
 * are planned for a later pass.
 */
export const InfrastructureComputeSection = () => {
  const { data: project } = useSelectedProjectQuery()
  const { data: organization } = useSelectedOrganizationQuery()

  const billingUiEnabled = useIsBillingUiEnabled(organization)
  const { mutate, isPending } = useResizeComputeMutation()

  const currentTier = ((project as { compute_size_id?: ComputeTierId } | undefined)
    ?.compute_size_id ?? 'nano') as ComputeTierId
  const planTier = (organization?.plan?.id ?? 'free') as PlanTierId
  const ref = project?.ref

  const [target, setTarget] = useState<ComputeTierId | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const currentName = tierById(currentTier)?.displayName
  const targetName = target ? tierById(target)?.displayName : '…'
  const activeId = target ?? currentTier

  if (!billingUiEnabled) {
    return (
      <ScaffoldContainer>
        <ScaffoldSection isFullWidth>
          <Alert_Shadcn_>
            <AlertTitle_Shadcn_>Compute management is unavailable</AlertTitle_Shadcn_>
            <AlertDescription_Shadcn_>
              Infrastructure controls are managed by your operator on this deployment.
            </AlertDescription_Shadcn_>
          </Alert_Shadcn_>
        </ScaffoldSection>
      </ScaffoldContainer>
    )
  }

  const renderCard = (id: ComputeTierId) => (
    <ComputeTierCard
      tier={tierById(id)}
      planTier={planTier}
      variant="wide"
      selected={activeId === id}
      onClick={() => setTarget(id)}
    />
  )

  return (
    <ScaffoldContainer>
      <ScaffoldSection isFullWidth>
        <div className="flex flex-col gap-6">
          {/* Intro + current tier */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="text-base font-medium text-foreground m-0">Compute size</h2>
              <span className="text-sm text-foreground-light">Current tier</span>
              <Badge>{currentName}</Badge>
            </div>
            <p className="text-sm text-foreground-light max-w-2xl m-0">
              Each tier sizes your project&apos;s isolated Postgres + AI runtime and bundles disk,
              object storage, egress, and monthly active users. Scaling up unlocks higher
              throughput for multi-agent and production workloads — billed per hour against your
              organization&apos;s credit balance.
            </p>
          </div>

          {/* Row 1 — Sandbox on its own */}
          <div>{renderCard('nano')}</div>

          {/* Row 2 — Builder + Workshop */}
          <div className="grid gap-4 md:grid-cols-2">
            {renderCard('micro')}
            {renderCard('small')}
          </div>

          {/* Row 3 — Studio + Foundry */}
          <div className="grid gap-4 md:grid-cols-2">
            {renderCard('medium')}
            {renderCard('large')}
          </div>

          {/* Apply */}
          <div className="flex justify-end">
            <Button
              type="primary"
              disabled={!target || target === currentTier || !ref}
              onClick={() => setConfirmOpen(true)}
            >
              {target && target !== currentTier ? `Resize to ${targetName}` : 'Select a new tier'}
            </Button>
          </div>

          {/* Row 4 — Enterprise managed hosting */}
          <EnterpriseHostingCard />
        </div>
      </ScaffoldSection>

      <Modal visible={confirmOpen} onCancel={() => setConfirmOpen(false)} header="Resize compute" hideFooter>
        <div className="space-y-4 p-4">
          <p className="text-sm text-foreground-light">
            Resize from <strong>{currentName}</strong> to <strong>{targetName}</strong>?
          </p>
          <p className="text-xs text-warning">
            Resizing briefly restarts the database (~1–3 min downtime). Connections drop and
            reconnect.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="default" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              type="primary"
              loading={isPending}
              disabled={!target || !ref}
              onClick={() =>
                target &&
                ref &&
                mutate(
                  { ref, computeSizeId: target },
                  {
                    onSuccess: () => {
                      toast.success(`Resizing to ${targetName}. This may take a few minutes.`)
                      setConfirmOpen(false)
                      setTarget(null)
                    },
                    onError: (e) =>
                      toast.error(
                        `Resize failed: ${e instanceof Error ? e.message : 'unknown error'}`
                      ),
                  }
                )
              }
            >
              Resize to {targetName}
            </Button>
          </div>
        </div>
      </Modal>
    </ScaffoldContainer>
  )
}

/**
 * Enterprise managed-hosting option — not a self-serve compute tier; routes to
 * sales. Copy mirrors the Enterprise card on the public pricing page.
 */
function EnterpriseHostingCard() {
  const perks = [
    { icon: Building2, label: 'Managed cloud or private VPC / on-prem' },
    { icon: ShieldCheck, label: 'SOC 2 + ISO 27001 compliance' },
    { icon: KeyRound, label: 'SSO, SCIM & audit logs' },
    { icon: Headset, label: 'Dedicated solutions engineer' },
    { icon: FileCheck2, label: 'Procurement-ready terms & SLAs' },
  ]
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-default bg-surface-100 p-5 sm:flex-row sm:items-center">
      <div className="flex items-start gap-3 sm:w-72 sm:shrink-0">
        <span className="flex h-11 w-11 items-center justify-center rounded-md bg-foreground/10 text-foreground shrink-0">
          <Building2 size={22} strokeWidth={1.75} />
        </span>
        <div className="space-y-1">
          <div className="font-medium text-foreground">Enterprise · Managed hosting</div>
          <div className="text-xs text-foreground-light leading-snug">
            Production-grade scale and a deployment model that fits your security posture.
          </div>
          <div className="pt-1 text-sm font-semibold text-foreground">Custom pricing</div>
        </div>
      </div>
      <dl className="grid flex-1 grid-cols-1 gap-x-6 gap-y-2 text-xs text-foreground-light sm:grid-cols-2">
        {perks.map(({ icon: PerkIcon, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <PerkIcon size={14} className="text-foreground-lighter shrink-0" />
            <span>{label}</span>
          </div>
        ))}
      </dl>
      <Button asChild type="default" className="sm:shrink-0">
        <Link
          href="https://calendly.com/hello-powabase/powabase-demo"
          target="_blank"
          rel="noreferrer"
        >
          Contact sales
        </Link>
      </Button>
    </div>
  )
}

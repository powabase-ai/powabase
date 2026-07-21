import { useState } from 'react'

import { useComputeSizesQuery } from '@/data/billing/compute-sizes-query'
import { type PlanTierId } from '@/data/billing/compute-tiers.display'
import { millicentsToUsd } from '@/lib/billing-units'

const PLAN_LABEL: Record<PlanTierId, string> = {
  free: 'Free',
  'self-serve': 'Self-Serve',
  scale: 'Scale',
}

const vcpu = (millicores: number) => (millicores / 1000).toFixed(1).replace(/\.0$/, '')
const gib = (mib: number) => (mib / 1024).toFixed(1).replace(/\.0$/, '')

export function ComputePricingPanel({ slug, planTier }: { slug: string; planTier: PlanTierId }) {
  const { data: sizes } = useComputeSizesQuery(slug)
  const [previewPlan, setPreviewPlan] = useState<PlanTierId>(planTier)
  const [expanded, setExpanded] = useState(false)

  if (!sizes || sizes.length === 0) return null
  const rows = sizes
  const visible = expanded ? rows : rows.slice(0, 3)

  return (
    <section className="space-y-3 rounded border p-4" data-testid="compute-pricing-panel">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Compute pricing</h2>
        <label className="flex items-center gap-2 text-sm text-foreground-light">
          Rate at
          <select
            data-testid="compute-rate-plan"
            className="rounded border border-default bg-transparent px-2 py-1"
            value={previewPlan}
            onChange={(e) => setPreviewPlan(e.target.value as PlanTierId)}
          >
            {(['free', 'self-serve', 'scale'] as PlanTierId[]).map((p) => (
              <option key={p} value={p}>
                {PLAN_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-foreground-light">
              <th className="py-1 pr-4">Tier</th>
              <th className="py-1 pr-4">Postgres / AI</th>
              <th className="py-1 pr-4">$/hr</th>
              <th className="py-1 pr-4">EBS</th>
              <th className="py-1 pr-4">S3</th>
              <th className="py-1 pr-4">Egress/mo</th>
              <th className="py-1 pr-4">MAU</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const aiVcpu = row.total_vcpu_millicores - row.postgres_vcpu_millicores
              const aiRam = row.total_ram_mib - row.postgres_ram_mib
              // Price is server-computed on the row itself (prices_by_plan) —
              // COGS/margin never reach the browser. Guard against a
              // malformed/incomplete row instead of crashing the whole panel.
              const rate = row.prices_by_plan
                ? millicentsToUsd(row.prices_by_plan[previewPlan])
                : null
              return (
                <tr
                  key={row.id}
                  data-testid={`compute-row-${row.id}`}
                  className="border-t border-default"
                >
                  <td className="py-1 pr-4 font-medium">{row.display_name}</td>
                  <td className="py-1 pr-4 text-foreground-light">
                    {vcpu(row.postgres_vcpu_millicores)}/{gib(row.postgres_ram_mib)} · {vcpu(aiVcpu)}/
                    {gib(aiRam)}
                  </td>
                  <td className="py-1 pr-4">{rate === null ? '—' : `$${rate.toFixed(4)}`}</td>
                  <td className="py-1 pr-4 text-foreground-light">{row.bundles.ebs_storage_gb} GB</td>
                  <td className="py-1 pr-4 text-foreground-light">{row.bundles.s3_storage_gb} GB</td>
                  <td className="py-1 pr-4 text-foreground-light">{row.bundles.egress_gb} GB</td>
                  <td className="py-1 pr-4 text-foreground-light">
                    {(row.bundles.regular_mau / 1000).toFixed(0)}k
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {rows.length > 3 && (
        <button
          type="button"
          data-testid="compute-toggle"
          className="text-sm text-brand hover:underline"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show less' : `See all ${rows.length} tiers`}
        </button>
      )}
      <p className="text-xs text-foreground-lighter">
        Each tier bundles storage, egress &amp; MAU; overage beyond the bundle is billed at your
        plan&apos;s rates. Paid plans get cheaper per-hour compute.
      </p>
    </section>
  )
}

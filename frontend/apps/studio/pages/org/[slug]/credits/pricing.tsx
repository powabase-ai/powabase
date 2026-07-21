import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'

import DefaultLayout from '@/components/layouts/DefaultLayout'
import OrganizationLayout from '@/components/layouts/OrganizationLayout'
import { UnknownInterface } from '@/components/ui/UnknownInterface'
import { usePricingQuery, type PricingRow } from '@/data/credits/pricing-query'
import { useIsFeatureEnabled } from '@/hooks/misc/useIsFeatureEnabled'
import { formatBillingAmount } from '@/lib/billing-units'
import type { NextPageWithLayout } from '@/types'

type SortDir = 'asc' | 'desc'

interface OrgCreditsPricingPageProps {
  dehydratedState: any
  /**
   * Test/storybook override for the `billing:ai_on_us` gate. When omitted
   * (production) the gate reads from `useIsFeatureEnabled('billing:ai_on_us')`.
   * Matches the prop-override pattern established in Phase 11.1 (CostTooltip).
   */
  isAiOnUsEnabled?: boolean
}

const OrgCreditsPricingPage: NextPageWithLayout<OrgCreditsPricingPageProps> = ({
  isAiOnUsEnabled,
}) => {
  const router = useRouter()
  const slug = router.query.slug as string | undefined

  const enabled = useIsFeatureEnabled('credits:enabled')
  const aiOnUsFromHook = useIsFeatureEnabled('billing:ai_on_us')
  const aiOnUsEnabled = isAiOnUsEnabled ?? aiOnUsFromHook
  const { data, isLoading, isError } = usePricingQuery({ enabled })
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // When the page mounts with a #<action> hash, the browser does not
  // always scroll on its own for client-side navigations — explicitly
  // scroll the matching row into view once the table has rendered.
  useEffect(() => {
    if (!data) return
    if (typeof window === 'undefined') return
    const hash = window.location.hash
    if (!hash || hash.length <= 1) return
    const id = hash.slice(1)
    // Defer to next frame so the rows are committed to the DOM.
    requestAnimationFrame(() => {
      const el = document.getElementById(id)
      if (el) el.scrollIntoView({ block: 'start' })
    })
  }, [data])

  if (!enabled) {
    return <UnknownInterface urlBack={slug ? `/org/${slug}` : '/projects'} />
  }

  // Fixed-rate rows render unconditionally. The llm_passthrough row
  // (llm_call) is gated under `billing:ai_on_us`; when the flag is off the
  // row is hidden entirely. Rows without an explicit cost_model default to
  // 'fixed' so older backends that don't yet serialize the field continue
  // to render.
  const rows: PricingRow[] = data
    ? [...data.pricing]
        .filter((r) => {
          const model = r.cost_model ?? 'fixed'
          if (model === 'fixed') return true
          if (model === 'llm_passthrough') return aiOnUsEnabled
          return false
        })
        .sort((a, b) =>
          sortDir === 'asc' ? a.unit_credits - b.unit_credits : b.unit_credits - a.unit_credits,
        )
    : []

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Credit pricing</h1>
          <p className="text-sm text-foreground-light mt-1">
            Each action below charges the listed rate per unit. Pricing covers
            platform service fees only — LLM token costs are billed directly
            by your provider via your own API key.
          </p>
        </div>

        {isLoading && (
          <p className="text-xs text-foreground-muted">Loading pricing…</p>
        )}

        {isError && (
          <p className="text-xs text-[#fca5a5]">Failed to load pricing.</p>
        )}

        {data && (
          <div className="overflow-x-auto rounded-lg border border-default">
            <table className="w-full text-xs">
              <thead className="bg-surface-200 text-foreground-light">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Action</th>
                  <th
                    role="columnheader"
                    className="text-right px-3 py-2 font-medium cursor-pointer select-none"
                    onClick={() =>
                      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
                    }
                  >
                    Cost {sortDir === 'asc' ? '↑' : '↓'}
                  </th>
                  <th className="text-left px-3 py-2 font-medium">Unit</th>
                  <th className="text-left px-3 py-2 font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {rows.map((row) => {
                  const model = row.cost_model ?? 'fixed'
                  const costLabel =
                    model === 'llm_passthrough'
                      ? 'Variable'
                      : row.unit_credits === 0
                        ? 'Free'
                        : `${formatBillingAmount(row.unit_credits)} per ${row.unit_label}`
                  return (
                    <tr key={row.action} id={row.action} className="hover:bg-surface-200">
                      <td className="px-3 py-2 text-foreground">
                        <code className="text-xs">{row.action}</code>
                      </td>
                      <td className="px-3 py-2 text-right text-foreground-light tabular-nums">
                        {costLabel}
                      </td>
                      <td className="px-3 py-2 text-foreground-light">{row.unit_label}</td>
                      <td className="px-3 py-2 text-foreground-muted">
                        {row.description ?? ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {aiOnUsEnabled && (
          <section className="rounded-lg border border-default p-4 space-y-2">
            <h3 className="text-sm font-medium text-foreground">AI-on-us vs BYOK</h3>
            <p className="text-xs text-foreground-light">
              AI-on-us: ~25% markup over raw provider cost, charged per-call
              with model + token transparency in your activity log.
            </p>
            <p className="text-xs text-foreground-light">
              BYOK: $0 for LLM calls; you only pay for platform-service
              actions above.
            </p>
          </section>
        )}
      </div>
    </div>
  )
}

OrgCreditsPricingPage.getLayout = (page) => (
  <DefaultLayout>
    <OrganizationLayout title="Pricing">{page}</OrganizationLayout>
  </DefaultLayout>
)

export default OrgCreditsPricingPage

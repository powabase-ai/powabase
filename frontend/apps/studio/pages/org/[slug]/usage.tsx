import Link from "next/link"
import { useRouter } from "next/router"
import { useMemo, useState } from "react"

import DefaultLayout from "@/components/layouts/DefaultLayout"
import OrganizationLayout from "@/components/layouts/OrganizationLayout"
import type { NextPageWithLayout } from "@/types"

import { ActivityTab } from "@/components/interfaces/Organization/Usage/Activity/ActivityTab"

import { StatCard, TimeSeriesBar, type SeriesDef } from "@/components/interfaces/Observability/charts"
import { useOrgStatsQuery } from "@/data/observability/use-org-stats-query"
import type { ObservabilityRange } from "@/data/observability/types"
import { useCreditsLimitsQuery } from "@/data/credits/limits-query"
import { useIsFeatureEnabled } from "@/hooks/misc/useIsFeatureEnabled"
import { formatBillingAmount } from "@/lib/billing-units"
import { adaptLimitsToUsageItems, type UsageCategoryItem } from "@/lib/credits/usage-adapter"
import { Tabs_Shadcn_, TabsContent_Shadcn_, TabsList_Shadcn_, TabsTrigger_Shadcn_ } from "ui"

const RANGE_OPTIONS: { label: string; value: ObservabilityRange }[] = [
  { label: "Last 24h", value: "24h" },
  { label: "Last 7d", value: "7d" },
  { label: "Last 30d", value: "30d" },
]

const TOP_N_PROJECTS_IN_CHART = 5
// Canonical Tailwind hex — Tailwind color name classes are remapped to Radix
// in this repo; see memory/project_tailwind_radix_remap.md.
const PROJECT_COLORS = ["#c4b5fd", "#60a5fa", "#34d399", "#fbbf24", "#fb923c", "#f472b6"]
const OTHER_COLOR = "#a1a1aa"

const OrgUsagePage: NextPageWithLayout = () => {
  const router = useRouter()
  const slug = router.query.slug as string | undefined

  const [range, setRange] = useState<ObservabilityRange>("7d")
  const stats = useOrgStatsQuery({ slug, range, metric: "tokens" })

  // Credits gate — when true the page shows a credits summary section
  // sourced from /credits/limits instead of (or in addition to) the
  // Supabase Stripe data path that this fork does not use.
  const creditsEnabled = useIsFeatureEnabled('credits:enabled')
  // Activity sub-tab is the per-charge ledger; reserved for paid tiers.
  // Keep off until paid plans ship.
  const activityEnabled = useIsFeatureEnabled('credits:activity')
  const { data: limitsData } = useCreditsLimitsQuery(slug, { enabled: creditsEnabled })
  const creditItems: UsageCategoryItem[] = creditsEnabled && limitsData
    ? adaptLimitsToUsageItems(limitsData)
    : []

  const creditsOverviewBody = creditItems.length === 0 ? (
    <p className="text-xs text-foreground-muted">Loading credit limits…</p>
  ) : (
    <div className="space-y-3">
      {creditItems.map((item) => {
        // Bar fills based on REMAINING ratio (full = lots left, empty
        // = depleted) — aligns with the top-bar "X / Y this month"
        // framing. Clamped to 100% so admin grants exceeding the cap
        // don't overflow the bar visually. Smoke obs #1.
        const pct = item.limit > 0
          ? Math.min(100, Math.max(0, Math.round((item.remaining / item.limit) * 100)))
          : 0
        const barColor =
          item.status === 'exceeded'
            ? 'bg-red-500'
            : item.status === 'warning'
            ? 'bg-yellow-400'
            : 'bg-brand'
        const dateOnly = typeof item.renews_at === 'string'
          ? item.renews_at.split('T')[0]
          : '—'
        // 'one-off' = the free plan's non-refilling one-time grant; any other
        // period is a refilling allowance. Single signal, set by the adapter.
        const refills = item.period !== 'one-off'
        const cadence = item.period === 'month' ? 'monthly' : `per ${item.period}`
        return (
          <div key={item.key} className="rounded-lg border border-default p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-foreground font-medium">{item.label}</span>
              <span className="text-foreground-light tabular-nums">
                {refills
                  ? `${formatBillingAmount(item.remaining)} of ${formatBillingAmount(item.limit)}`
                  : formatBillingAmount(item.remaining)}
              </span>
            </div>
            {/* Progress bar only makes sense against a cap. The free plan's
                one-time grant has no cap (migration 0014), so it's hidden. */}
            {refills && (
              <div className="h-2 w-full rounded-full bg-surface-300 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${barColor}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
            <p className="text-xs text-foreground-muted">
              {refills ? `Resets ${cadence} · next reset ${dateOnly}` : "One-time credit · doesn't expire"}
            </p>
          </div>
        )
      })}
    </div>
  )

  // Build the "tokens by project" time-series chart. Top-N projects get
  // their own series; everything else rolls into "other".
  const { buckets, seriesDefs } = useMemo(() => {
    const projects = stats.data?.projects ?? []
    const series = stats.data?.series ?? []
    const topRefs = new Set(
      [...projects]
        .sort((a, b) => b.totalTokens - a.totalTokens)
        .slice(0, TOP_N_PROJECTS_IN_CHART)
        .map((p) => p.ref),
    )
    const refToName = new Map(projects.map((p) => [p.ref, p.name]))

    const byBucket = new Map<string, Record<string, number>>()
    for (const row of series) {
      const key = topRefs.has(row.projectRef) ? row.projectRef : "__other__"
      const entry = byBucket.get(row.bucket) ?? {}
      entry[key] = (entry[key] ?? 0) + row.value
      byBucket.set(row.bucket, entry)
    }

    const bucketsOut = [...byBucket.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([bucket, vals]) => ({ bucket, ...vals }))

    const defs: SeriesDef[] = []
    let i = 0
    for (const ref of topRefs) {
      defs.push({
        key: ref,
        label: refToName.get(ref) ?? ref,
        color: PROJECT_COLORS[i % PROJECT_COLORS.length],
      })
      i += 1
    }
    if (projects.length > topRefs.size) {
      defs.push({ key: "__other__", label: "Other", color: OTHER_COLOR })
    }

    return { buckets: bucketsOut, seriesDefs: defs }
  }, [stats.data])

  const totalRuns = useMemo(
    () => (stats.data?.projects ?? []).reduce((s, p) => s + p.agentRuns, 0),
    [stats.data?.projects],
  )
  const totalFailed = useMemo(
    () => (stats.data?.projects ?? []).reduce((s, p) => s + p.failedRuns, 0),
    [stats.data?.projects],
  )
  const totalTokens = useMemo(
    () => (stats.data?.projects ?? []).reduce((s, p) => s + p.totalTokens, 0),
    [stats.data?.projects],
  )

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Organization usage</h1>
            <p className="text-sm text-foreground-light mt-1">
              Token usage, activity, and error hotspots across every project in this organization.
            </p>
          </div>
          <select
            aria-label="Time range"
            className="text-xs px-2 py-1 rounded-md border border-default bg-surface-200 text-foreground shrink-0"
            value={range}
            onChange={(e) => setRange(e.target.value as ObservabilityRange)}
          >
            {RANGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Summary cards */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Projects"
            value={stats.data?.projects.length ?? 0}
            tone="neutral"
            isLoading={stats.isLoading}
          />
          <StatCard
            label="Agent runs"
            value={totalRuns}
            tone="neutral"
            isLoading={stats.isLoading}
          />
          <StatCard
            label="Failed runs"
            value={totalFailed}
            tone={totalFailed > 0 ? "danger" : "ok"}
            isLoading={stats.isLoading}
          />
          <StatCard
            label="Tokens"
            value={totalTokens.toLocaleString()}
            tone="neutral"
            isLoading={stats.isLoading}
          />
        </section>

        {/* Credits summary — visible only when credits:enabled.
            Activity tab gated separately on credits:activity (paid-tier feature). */}
        {creditsEnabled && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Credits</h2>
              {slug && (
                <Link
                  href={`/org/${slug}/credits/pricing`}
                  className="text-xs text-brand hover:text-brand-600"
                >
                  View pricing →
                </Link>
              )}
            </div>
            {activityEnabled ? (
              <Tabs_Shadcn_ defaultValue="overview" className="w-full">
                <TabsList_Shadcn_ className="grid w-full grid-cols-2">
                  <TabsTrigger_Shadcn_ value="overview">Overview</TabsTrigger_Shadcn_>
                  <TabsTrigger_Shadcn_ value="activity">Activity</TabsTrigger_Shadcn_>
                </TabsList_Shadcn_>
                <TabsContent_Shadcn_ value="overview" className="space-y-3">
                  {creditsOverviewBody}
                </TabsContent_Shadcn_>
                <TabsContent_Shadcn_ value="activity">
                  {slug && <ActivityTab orgSlug={slug} />}
                </TabsContent_Shadcn_>
              </Tabs_Shadcn_>
            ) : (
              creditsOverviewBody
            )}
          </section>
        )}

        {/* Tokens over time */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">
            Tokens over time
            <span className="text-xs text-foreground-muted ml-2">
              top {TOP_N_PROJECTS_IN_CHART} projects + other
            </span>
          </h2>
          <TimeSeriesBar
            data={buckets}
            series={seriesDefs}
            emptyMessage={stats.isLoading ? "Loading…" : "No LLM activity in range yet"}
          />
        </section>

        {/* Per-project table */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Projects</h2>
          <div className="overflow-x-auto rounded-lg border border-default">
            <table className="w-full text-xs">
              <thead className="bg-surface-200 text-foreground-light">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Project</th>
                  <th className="text-right px-3 py-2 font-medium">Agent runs</th>
                  <th className="text-right px-3 py-2 font-medium">Failed</th>
                  <th className="text-right px-3 py-2 font-medium">Tokens</th>
                  <th className="text-left px-3 py-2 font-medium">Last activity</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {(stats.data?.projects ?? []).map((p) => (
                  <tr key={p.ref} className="hover:bg-surface-200">
                    <td className="px-3 py-2 text-foreground">{p.name}</td>
                    <td className="px-3 py-2 text-right text-foreground-light tabular-nums">
                      {p.agentRuns}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        p.failedRuns > 0 ? "text-[#fca5a5]" : "text-foreground-muted"
                      }`}
                    >
                      {p.failedRuns}
                    </td>
                    <td className="px-3 py-2 text-right text-foreground-light tabular-nums">
                      {p.totalTokens.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-foreground-muted">
                      {p.lastActivityAt
                        ? new Date(p.lastActivityAt).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/project/${p.ref}/observability`}
                        className="text-xs text-brand hover:text-brand-600"
                      >
                        Observe →
                      </Link>
                    </td>
                  </tr>
                ))}
                {!stats.isLoading && (stats.data?.projects.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-foreground-muted">
                      No projects in this organization yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {stats.isError && (
          <div className="text-xs text-[#fca5a5]">
            Failed to load stats:{" "}
            {stats.error instanceof Error ? stats.error.message : "unknown error"}
          </div>
        )}
      </div>
    </div>
  )
}

OrgUsagePage.getLayout = (page) => (
  <DefaultLayout>
    <OrganizationLayout title="Usage">{page}</OrganizationLayout>
  </DefaultLayout>
)

export default OrgUsagePage

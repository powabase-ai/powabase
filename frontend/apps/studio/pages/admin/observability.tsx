import Link from "next/link"
import { useState } from "react"
import {
  Tabs_Shadcn_ as Tabs,
  TabsContent_Shadcn_ as TabsContent,
  TabsList_Shadcn_ as TabsList,
  TabsTrigger_Shadcn_ as TabsTrigger,
} from "ui"

import { AdminLayout } from "@/components/admin/AdminLayout"
import type { NextPageWithLayout } from "@/types"

import { StatCard, TimeSeriesBar, type SeriesDef } from "@/components/interfaces/Observability/charts"
import { usePlatformStatsQuery } from "@/data/observability/use-org-stats-query"
import { usePromQuery } from "@/data/observability/use-prom-query"
import type { ObservabilityRange } from "@/data/observability/types"
import { withAuth } from "@/hooks/misc/withAuth"

const RANGE_OPTIONS: { label: string; value: ObservabilityRange }[] = [
  { label: "Last hour", value: "1h" },
  { label: "Last 24h", value: "24h" },
  { label: "Last 7d", value: "7d" },
]

// Canonical Tailwind hex — repo's Tailwind config remaps named color classes
// to Radix palettes, which renders muddy on dark bg. See the Radix-remap memo.
const PROJECT_COLORS = ["#c4b5fd", "#60a5fa", "#34d399", "#fbbf24", "#fb923c", "#f472b6"]

const AdminObservabilityPage: NextPageWithLayout = () => {
  const [range, setRange] = useState<ObservabilityRange>("24h")
  const [tab, setTab] = useState<"projects" | "infra">("projects")

  // AdminLayout guarantees only admins reach this component; these queries
  // are safe to fire unconditionally. Server-side @require_platform_admin
  // remains the real authorization gate.
  const stats = usePlatformStatsQuery({ range, metric: "tokens" })
  const reqRate = usePromQuery({
    query: "sum by (endpoint) (rate(control_plane_flask_http_request_total[5m]))",
    range: "1h",
  })
  const celeryFail = usePromQuery({
    query: 'sum by (task) (rate(celery_tasks_total{status="failure"}[15m]))',
    range: "1h",
  })

  const { buckets, seriesDefs } = buildTokenSeries(stats.data)

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto p-6 space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Platform observability</h1>
            <p className="text-sm text-foreground-light mt-1">
              Cross-tenant rollup of LLM token usage, project health, and service metrics.
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

        <Tabs value={tab} onValueChange={(v) => setTab(v as "projects" | "infra")}>
          <TabsList className="flex gap-x-5">
            <TabsTrigger className="py-2.5" value="projects">
              Projects
            </TabsTrigger>
            <TabsTrigger className="py-2.5" value="infra">
              Infra
            </TabsTrigger>
          </TabsList>

          {/* ─── Projects tab ─────────────────────────────────────── */}
          <TabsContent value="projects" className="space-y-8 mt-4">
            <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                label="Projects"
                value={stats.data?.projects.length ?? 0}
                tone="neutral"
                isLoading={stats.isLoading}
              />
              <StatCard
                label="Projects w/ failures"
                value={(stats.data?.projects ?? []).filter((p) => p.failedRuns > 0).length}
                tone={
                  stats.data && stats.data.projects.some((p) => p.failedRuns > 0) ? "danger" : "ok"
                }
                isLoading={stats.isLoading}
              />
              <StatCard
                label="Total runs"
                value={(stats.data?.projects ?? []).reduce((s, p) => s + p.agentRuns, 0)}
                tone="neutral"
                isLoading={stats.isLoading}
              />
              <StatCard
                label="Total tokens"
                value={(stats.data?.projects ?? [])
                  .reduce((s, p) => s + p.totalTokens, 0)
                  .toLocaleString()}
                tone="neutral"
                isLoading={stats.isLoading}
              />
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Tokens by project</h2>
              <TimeSeriesBar
                data={buckets}
                series={seriesDefs}
                emptyMessage={stats.isLoading ? "Loading…" : "No token activity in range"}
              />
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Project health</h2>
              <div className="overflow-x-auto rounded-lg border border-default">
                <table className="w-full text-xs">
                  <thead className="bg-surface-200 text-foreground-light">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Project</th>
                      <th className="text-right px-3 py-2 font-medium">Runs</th>
                      <th className="text-right px-3 py-2 font-medium">Failed</th>
                      <th className="text-right px-3 py-2 font-medium">Tokens</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-muted">
                    {(stats.data?.projects ?? []).map((p) => (
                      <tr key={p.ref}>
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
                        <td className="px-3 py-2 text-right">
                          <Link
                            href={`/project/${p.ref}/observability`}
                            className="text-brand hover:text-brand-600"
                          >
                            Observe →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </TabsContent>

          {/* ─── Infra tab ────────────────────────────────────────── */}
          <TabsContent value="infra" className="space-y-8 mt-4">
            <PromPanel
              title="Control-plane request rate"
              subtitle="sum by(endpoint) rate(control_plane_flask_http_request_total[5m])"
              query={reqRate}
            />
            <PromPanel
              title="Celery task failure rate"
              subtitle='sum by(task) rate(celery_tasks_total{status="failure"}[15m])'
              query={celeryFail}
            />
            <div className="text-xs text-foreground-muted">
              PromQL access is allowlisted server-side to a fixed set of
              metrics. For richer dashboards, hit your Grafana instance directly.
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

AdminObservabilityPage.getLayout = (page) => <AdminLayout>{page}</AdminLayout>

// withAuth ensures unauthenticated users get redirected to sign-in instead
// of landing on the in-page "Platform operator access required" message —
// that copy is for *authenticated* non-admins. The server-side
// require_platform_admin guard remains the real authorization check.
export default withAuth(AdminObservabilityPage)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTokenSeries(
  data: ReturnType<typeof usePlatformStatsQuery>["data"],
): { buckets: Array<{ bucket: string } & Record<string, number>>; seriesDefs: SeriesDef[] } {
  const projects = data?.projects ?? []
  const series = data?.series ?? []
  const topRefs = new Set(
    [...projects]
      .sort((a, b) => b.totalTokens - a.totalTokens)
      .slice(0, 10)
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
  const buckets: Array<{ bucket: string } & Record<string, number>> = [
    ...byBucket.entries(),
  ]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([bucket, vals]) => {
      const row: { bucket: string } & Record<string, number> = { bucket } as never
      for (const [k, v] of Object.entries(vals)) {
        row[k] = v
      }
      return row
    })
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
    defs.push({ key: "__other__", label: "Other", color: "#a1a1aa" })
  }
  return { buckets, seriesDefs: defs }
}

function PromPanel({
  title,
  subtitle,
  query,
}: {
  title: string
  subtitle: string
  query: ReturnType<typeof usePromQuery>
}) {
  return (
    <div className="rounded-lg border border-default bg-surface-100 p-4 space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <code className="text-[11px] font-mono text-foreground-muted">{subtitle}</code>
      </div>
      {query.isLoading ? (
        <div className="text-xs text-foreground-muted">Loading…</div>
      ) : query.isError ? (
        <div className="text-xs text-[#fca5a5]">
          {query.error instanceof Error ? query.error.message : "Prometheus query failed"}
        </div>
      ) : query.data?.status === "success" ? (
        <pre className="text-[11px] font-mono text-foreground-light overflow-x-auto max-h-72 bg-surface-200 rounded p-2">
          {JSON.stringify(query.data.data?.result ?? [], null, 2)}
        </pre>
      ) : (
        <div className="text-xs text-foreground-muted">No result</div>
      )}
    </div>
  )
}

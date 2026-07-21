import { useState } from "react"
import type {
  AdminProjectActivityRow,
  AdminProjectActivitySummary,
} from "@/data/admin/use-admin-project-query"
import { useAdminProjectActivityQuery } from "@/data/admin/use-admin-project-activity-query"
import { formatUsd } from "./credits"
import { LocalTimestamp } from "./LocalTimestamp"

const PAGE_SIZE = 50

/**
 * Per-project activity for the admin project page, built entirely from the
 * control-plane `credit_ledger` (rows scoped to this project_id). Every
 * chargeable action lands there — LLM calls (model + tokens), indexing, web
 * search/scrape, agent/orchestration/workflow runs, compute. This is what an
 * operator can review WITHOUT joining the tenant project (which would 403).
 * Raw DB-access logs and indexed-document content live only in the tenant
 * project DB and are intentionally not surfaced here.
 *
 * The summary table is fixed; the feed below it paginates and can be filtered
 * to a single action — without that, a high-frequency action (e.g. an hourly
 * `compute_hourly` charge) floods the window and buries everything older.
 */
export function ProjectActivity({
  projectRef,
  activity,
  summary,
}: {
  projectRef: string | undefined
  /** Latest page already embedded in the project-detail response — seeds the
   * initial (unfiltered, first-page) view so the first paint needs no extra
   * round-trip. */
  activity: AdminProjectActivityRow[]
  summary: AdminProjectActivitySummary[]
}) {
  const [action, setAction] = useState("")
  const [page, setPage] = useState(0)

  // Total rows across all actions, from the summary the detail page already
  // loaded — used to seed the feed's `total` on the initial paint and as a
  // fallback for a freshly-selected action filter before its first fetch lands.
  const summaryTotal = summary.reduce((sum, s) => sum + s.count, 0)
  const seedTotal =
    action === "" ? summaryTotal : (summary.find((s) => s.action === action)?.count ?? 0)

  const { data, isFetching } = useAdminProjectActivityQuery({
    ref: projectRef,
    action,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    initialData: { activity, total: summaryTotal },
  })

  const rows = data?.activity ?? []
  const total = data?.total ?? seedTotal
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const onActionChange = (value: string) => {
    setAction(value)
    setPage(0)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-medium mb-1">Activity</h2>
        <p className="text-xs text-foreground-light mb-3">
          Billable actions recorded in the control plane (LLM calls, indexing, tool calls, runs,
          compute). Raw DB access and document content live in the tenant project and aren&apos;t
          shown here.
        </p>
        {summary.length === 0 ? (
          <p className="text-sm text-foreground-light">No billable activity recorded yet.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="text-left text-xs text-foreground-light uppercase tracking-wide border-b border-border">
              <tr>
                <th className="py-2">Action</th>
                <th className="py-2">Count</th>
                <th className="py-2 text-right">Total credits</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.action} className="border-b border-border">
                  <td className="py-2 font-mono text-xs">{s.action}</td>
                  <td className="py-2 tabular-nums">{s.count}</td>
                  <td className="py-2 text-right tabular-nums">
                    {formatUsd(s.total_millicents, 4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">Recent activity</h3>
          {summary.length > 0 ? (
            <select
              value={action}
              onChange={(e) => onActionChange(e.target.value)}
              className="text-xs border border-border rounded bg-transparent px-2 py-1"
              aria-label="Filter by action"
            >
              <option value="">All actions</option>
              {summary.map((s) => (
                <option key={s.action} value={s.action}>
                  {s.action} ({s.count})
                </option>
              ))}
            </select>
          ) : null}
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-foreground-light">Nothing yet.</p>
        ) : (
          <>
            <table className="w-full text-sm border-collapse">
              <thead className="text-left text-xs text-foreground-light uppercase tracking-wide border-b border-border">
                <tr>
                  <th className="py-2">When</th>
                  <th className="py-2">Action</th>
                  <th className="py-2">Detail</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="py-2 whitespace-nowrap text-xs">
                      <LocalTimestamp iso={a.created_at} />
                    </td>
                    <td className="py-2 font-mono text-xs">{a.action}</td>
                    <td className="py-2 text-xs text-foreground-light">
                      {a.model ? (
                        <>
                          {a.model}
                          {a.prompt_tokens != null && (
                            <span className="text-foreground-lighter">
                              {" "}
                              · {a.prompt_tokens}+{a.completion_tokens ?? 0} tok
                            </span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums">{formatUsd(a.millicents, 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center justify-between mt-4 text-sm">
              <span>
                Page {Math.min(page, totalPages - 1) + 1} of {totalPages} · {total} total
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page === 0 || isFetching}
                  onClick={() => setPage(page - 1)}
                  className="px-2 py-1 border border-border rounded disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  disabled={page >= totalPages - 1 || isFetching}
                  onClick={() => setPage(page + 1)}
                  className="px-2 py-1 border border-border rounded disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

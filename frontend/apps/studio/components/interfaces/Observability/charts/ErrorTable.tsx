import dayjs from "dayjs"
import Link from "next/link"

// Compact table of recent errors. Used in all three observability pages:
// per-project (agent_runs.error), org (cross-project error digest), and
// platform (global error feed). Columns are configurable via the `columns`
// prop so the same primitive can show project-scoped vs cross-project data.

export interface ErrorRow {
  id: string
  when: string | null
  /** Short label e.g. "Agent run", "Extraction", "Workflow". */
  kind: string
  /** The error message or truncated first line of error. */
  message: string
  /** Optional project ref — present in cross-project rollups. */
  projectRef?: string
  /** Optional Table-Editor deep link to the source row this failure
   *  represents. When present, the ID column becomes a clickable mono
   *  link that navigates to the row in `/project/{ref}/editor/...`. */
  rowHref?: string
  /** Optional click target for the rest of the row (e.g. open the run in
   *  the Runs page). When both are set, clicking the ID navigates to the
   *  Table Editor and clicking elsewhere on the row goes to `href`. */
  href?: string
}

interface ErrorTableProps {
  rows: ErrorRow[]
  emptyMessage?: string
  showProject?: boolean
}

/** First 8 chars of a UUID, mono-formatted, with a tooltip showing the
 *  full ID on hover. Mirrors the way other Studio surfaces shorten run
 *  IDs while keeping copy-paste of the full UUID one click away. */
function ShortId({ id }: { id: string }) {
  const display = id.length > 8 ? `${id.slice(0, 8)}…` : id
  return (
    <span className="font-mono text-foreground" title={id}>
      {display}
    </span>
  )
}

export function ErrorTable({
  rows,
  emptyMessage = "No errors in range",
  showProject = false,
}: ErrorTableProps) {
  if (!rows.length) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-default bg-surface-100 py-6">
        <span className="text-sm text-foreground-muted">{emptyMessage}</span>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-default">
      <table className="w-full text-xs">
        <thead className="bg-surface-200 text-foreground-light">
          <tr>
            <th className="text-left px-3 py-2 font-medium">When</th>
            <th className="text-left px-3 py-2 font-medium">Kind</th>
            <th className="text-left px-3 py-2 font-medium">ID</th>
            {showProject && <th className="text-left px-3 py-2 font-medium">Project</th>}
            <th className="text-left px-3 py-2 font-medium">Error</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-muted">
          {rows.map((r) => {
            const idCell = r.rowHref ? (
              <Link
                href={r.rowHref}
                onClick={(e) => e.stopPropagation()}
                className="font-mono text-brand hover:text-brand-600 hover:underline"
                title={`${r.id}\nOpen in Table Editor`}
              >
                {r.id.length > 8 ? `${r.id.slice(0, 8)}…` : r.id}
              </Link>
            ) : (
              <ShortId id={r.id} />
            )
            const row = (
              <>
                <td className="px-3 py-2 text-foreground-muted whitespace-nowrap">
                  {r.when ? dayjs(r.when).format("MMM D HH:mm") : "—"}
                </td>
                <td className="px-3 py-2 text-foreground">{r.kind}</td>
                <td className="px-3 py-2 max-w-[180px]">{idCell}</td>
                {showProject && (
                  <td className="px-3 py-2 font-mono text-foreground-light">{r.projectRef ?? "—"}</td>
                )}
                <td className="px-3 py-2 text-[#fca5a5] truncate max-w-[320px]" title={r.message}>
                  {r.message}
                </td>
              </>
            )
            return r.href ? (
              <tr
                key={r.id}
                className="hover:bg-surface-200 cursor-pointer"
                onClick={() => {
                  if (r.href) window.location.assign(r.href)
                }}
              >
                {row}
              </tr>
            ) : (
              <tr key={r.id}>{row}</tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

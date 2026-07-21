import { useRouter } from "next/router"
import { useEffect, useRef, useState } from "react"
import { Input_Shadcn_ as Input } from "ui"

import { QueryErrorPanel } from "./QueryErrorPanel"

interface Column<T> {
  key: string
  header: string
  sortable?: boolean
  render: (row: T) => React.ReactNode
}

interface AdminListPageProps<T> {
  title: string
  searchPlaceholder: string
  columns: Column<T>[]
  rows: T[]
  total: number
  isLoading: boolean
  error: unknown
  onRetry?: () => void
  q: string
  setQ: (q: string) => void
  page: number
  pageSize: number
  setPage: (p: number) => void
  sort: string
  setSort: (s: string) => void
  rowLinkBuilder: (row: T) => string
  emptyCopy: string
  filteredEmptyCopy: string
  /** Optional per-row className, e.g. to color-code flagged accounts. */
  rowClassName?: (row: T) => string
  /** Optional control rendered in the header, left of the search box (e.g. Export CSV). */
  headerAction?: React.ReactNode
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

export function AdminListPage<T>({
  title,
  searchPlaceholder,
  columns,
  rows,
  total,
  isLoading,
  error,
  onRetry,
  q,
  setQ,
  page,
  pageSize,
  setPage,
  sort,
  setSort,
  rowLinkBuilder,
  emptyCopy,
  filteredEmptyCopy,
  rowClassName,
  headerAction,
}: AdminListPageProps<T>) {
  const router = useRouter()
  const [localQ, setLocalQ] = useState(q)
  const debouncedQ = useDebounced(localQ, 300)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const isFirstSearchEffect = useRef(true)

  useEffect(() => {
    if (isFirstSearchEffect.current) {
      isFirstSearchEffect.current = false
      return
    }
    setQ(debouncedQ)
    setPage(0)
  }, [debouncedQ, setQ, setPage])

  useEffect(() => {
    // Only clamp against a *real* total. While a page change is in flight a
    // query without placeholderData can briefly report total=0 → totalPages=1,
    // which would otherwise snap `page` back to 0 and trap the user on page 1.
    if (total > 0 && page > totalPages - 1) {
      setPage(totalPages - 1)
    }
  }, [page, total, totalPages, setPage])

  const onHeaderClick = (col: Column<T>) => {
    if (!col.sortable) return
    const [currentCol, currentDir] = sort.split(":")
    const nextDir = currentCol === col.key && currentDir === "desc" ? "asc" : "desc"
    setSort(`${col.key}:${nextDir}`)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <div className="flex items-center gap-2">
          {headerAction}
          <Input
            type="text"
            placeholder={searchPlaceholder}
            value={localQ}
            onChange={(e) => setLocalQ(e.target.value)}
            className="max-w-xs"
          />
        </div>
      </div>

      {error ? (
        <QueryErrorPanel error={error} onRetry={onRetry} message="Failed to load." />
      ) : isLoading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-10 bg-surface-100 animate-pulse rounded" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-foreground-light py-12 text-center">
          {q ? filteredEmptyCopy : emptyCopy}
        </div>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead className="text-left text-xs text-foreground-light uppercase tracking-wide border-b border-border">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={col.sortable ? "cursor-pointer py-2" : "py-2"}
                  onClick={() => onHeaderClick(col)}
                >
                  {col.header}
                  {col.sortable && sort.startsWith(`${col.key}:`)
                    ? sort.endsWith(":asc")
                      ? " ↑"
                      : " ↓"
                    : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                onClick={() => router.push(rowLinkBuilder(row))}
                className={`border-b border-border hover:bg-surface-100 cursor-pointer ${
                  rowClassName?.(row) ?? ""
                }`}
              >
                {columns.map((col) => (
                  <td key={col.key} className="py-2">
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {rows.length > 0 ? (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span>
            Page {Math.min(page, totalPages - 1) + 1} of {totalPages} · {total} total
          </span>
          <div className="flex gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
              className="px-2 py-1 border border-border rounded disabled:opacity-40"
            >
              Prev
            </button>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(page + 1)}
              className="px-2 py-1 border border-border rounded disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

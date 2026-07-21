import { useMemo, useState } from 'react'

import { useCreditsLedgerInfiniteQuery, type LedgerRow } from '@/data/credits/ledger-query'
import {
  useOrgProjectsInfiniteQuery,
  type OrgProject,
} from '@/data/projects/org-projects-infinite-query'

import { ActivityFilters, type ActivityFiltersState } from './ActivityFilters'
import { ActivityTable } from './ActivityTable'

// Spec decision #9: default is Last 30 days, not "All time".
const DEFAULT_INITIAL_FILTERS = (): ActivityFiltersState => ({
  start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
})

export function ActivityTab({ orgSlug }: { orgSlug: string }) {
  const [filters, setFilters] = useState<ActivityFiltersState>(DEFAULT_INITIAL_FILTERS)

  // Per spec decision #20: filter changes reset the cursor automatically
  // because filters are part of the queryKey — React Query starts fresh.
  const { data, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useCreditsLedgerInfiniteQuery(orgSlug, filters)

  const { data: projectsData } = useOrgProjectsInfiniteQuery({ slug: orgSlug })

  // Key projectsById by the project UUID so ActivityTable's `projectsById[row.project_id]`
  // resolves directly — ledger rows store project_id as a UUID. Pre-fix this was
  // keyed by ref (slug), so every row's project column fell back to the truncated
  // UUID display. Rows without an `id` are skipped — the BE always populates it,
  // so this is defensive code rather than an expected case.
  const projectsById = useMemo(() => {
    const allProjects = (projectsData?.pages.flatMap((p) => p.projects) ?? []) as OrgProject[]
    const entries: [string, { name: string; ref: string }][] = []
    for (const p of allProjects) {
      if (typeof p.id === 'string') {
        entries.push([p.id, { name: p.name, ref: p.ref }])
      }
    }
    return Object.fromEntries(entries) as Record<
      string,
      { name: string; ref: string } | undefined
    >
  }, [projectsData])

  const rows: LedgerRow[] = data?.pages.flatMap((p) => p.ledger) ?? []

  return (
    <div>
      <ActivityFilters orgSlug={orgSlug} filters={filters} onChange={setFilters} />
      <ActivityTable rows={rows} projectsById={projectsById} />
      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="mt-4 px-4 py-2 text-xs border border-default rounded hover:bg-surface-200 disabled:opacity-50 text-foreground"
        >
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  )
}

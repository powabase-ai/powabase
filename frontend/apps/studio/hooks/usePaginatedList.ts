import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query'
import { useMemo } from 'react'

export interface UsePaginatedListArgs<TItem> {
  enabled: boolean
  queryKey: readonly unknown[]
  pageSize?: number
  fetchPage: (args: {
    limit: number
    offset: number
    signal: AbortSignal
  }) => Promise<{ items: TItem[]; total: number }>
}

export interface UsePaginatedListResult<TItem> {
  items: TItem[]
  total: number
  isLoading: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean
  fetchNextPage: () => void
  error: Error | null
  refetch: () => Promise<unknown>
}

const DEFAULT_PAGE_SIZE = 50

interface PageData<TItem> {
  items: TItem[]
  total: number
  offset: number
}

export function usePaginatedList<TItem>(
  args: UsePaginatedListArgs<TItem>
): UsePaginatedListResult<TItem> {
  const pageSize = args.pageSize ?? DEFAULT_PAGE_SIZE

  const query = useInfiniteQuery<PageData<TItem>, Error>({
    queryKey: args.queryKey,
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const offset = pageParam as number
      const result = await args.fetchPage({ limit: pageSize, offset, signal })
      return { items: result.items, total: result.total, offset }
    },
    getNextPageParam: (lastPage) => {
      const next = lastPage.offset + lastPage.items.length
      return next < lastPage.total ? next : undefined
    },
    enabled: args.enabled,
    placeholderData: keepPreviousData,
  })

  const items = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data]
  )
  const total = query.data?.pages[query.data.pages.length - 1]?.total ?? 0

  return {
    items,
    total,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage ?? false,
    fetchNextPage: () => {
      if (!query.hasNextPage || query.isFetchingNextPage) return
      void query.fetchNextPage()
    },
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}

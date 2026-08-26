import { useEffect, useRef } from 'react'

import { useInvalidateProjectsInfiniteQuery } from '@/data/projects/org-projects-infinite-query'
import { useInvalidateProjectDetailsQuery } from '@/data/projects/project-detail-query'
import { useProjectStatusQuery } from '@/data/projects/project-status-query'
import { PROJECT_STATUS } from '@/lib/constants'

/** Statuses on which the /status poll has nothing more to learn. */
const SETTLED = [PROJECT_STATUS.ACTIVE_HEALTHY, PROJECT_STATUS.INIT_FAILED]
const POLL_INTERVAL = 4_000
/** Slower cadence while the platform cannot be reached — still retrying, as the surfaces say. */
const TRANSIENT_ERROR_INTERVAL = 15_000

/**
 * The one place that keeps the project caches in step with a project that is
 * being set up, failed set-up, or is being deleted.
 *
 * - Polls /status every 4 s while `enabled`, stopping on a settled status or
 *   on a 404 (the project is gone — the detail query's own 404 redirects).
 *   Any other error backs off to 15 s and keeps going.
 * - Invalidates the org project list once per project it is asked to
 *   reconcile (`reconcileList`: any project with provisioning history, or a
 *   not-active one): the card the user came from may predate a transition
 *   that finished before this page mounted — including a retry another
 *   client completed, whose first detail result here is already active.
 * - If /status is ahead of the project detail, refetches the detail at once.
 * - Whenever the detail's status changes, invalidates the org project list so
 *   the card catches up on its next render — the list is otherwise fresh for
 *   30 minutes and nothing else touches it.
 *
 * Mount it once per project page (the home does), unconditionally; `enabled`
 * gates the poll, `reconcileList` the one-time list invalidation, and the
 * change bookkeeping is cheap and always correct. A flag-off or legacy
 * project (`provisioning: null`, status ACTIVE_HEALTHY) passes false for
 * both and the hook does nothing.
 */
export function useProvisioningStatusSync(
  ref: string | undefined,
  detailStatus: string | undefined,
  enabled: boolean,
  reconcileList: boolean
): { isPollError: boolean } {
  const { invalidateProjectDetailsQuery } = useInvalidateProjectDetailsQuery()
  const { invalidateProjectsQuery } = useInvalidateProjectsInfiniteQuery()

  const polled = useProjectStatusQuery(
    { projectRef: ref },
    {
      enabled: enabled && !!ref,
      refetchInterval: (query) => {
        if (query.state.status === 'error') {
          return query.state.error?.code === 404 ? false : TRANSIENT_ERROR_INTERVAL
        }
        const status = query.state.data?.status
        return status && (SETTLED as string[]).includes(status) ? false : POLL_INTERVAL
      },
    }
  )

  const reconciledRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!reconcileList || !ref || reconciledRef.current === ref) return
    reconciledRef.current = ref
    invalidateProjectsQuery()
  }, [reconcileList, ref, invalidateProjectsQuery])

  const polledStatus = polled.data?.status
  useEffect(() => {
    if (ref && polledStatus && detailStatus && polledStatus !== detailStatus) {
      invalidateProjectDetailsQuery(ref)
    }
  }, [ref, polledStatus, detailStatus, invalidateProjectDetailsQuery])

  const lastDetailStatus = useRef(detailStatus)
  useEffect(() => {
    const previous = lastDetailStatus.current
    lastDetailStatus.current = detailStatus
    if (previous !== undefined && detailStatus !== undefined && previous !== detailStatus) {
      invalidateProjectsQuery()
    }
  }, [detailStatus, invalidateProjectsQuery])

  return { isPollError: polled.isError }
}

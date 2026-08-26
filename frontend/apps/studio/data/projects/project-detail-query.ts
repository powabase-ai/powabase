import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { projectKeys } from './keys'
import { OrgProjectsResponse } from './org-projects-infinite-query'
import type { ProjectProvisioning } from './provisioning'
import type { components } from '@/data/api'
import { get, handleError, isValidConnString } from '@/data/fetchers'
import type { ResponseError, UseCustomQueryOptions } from '@/types'

type ProjectDetailVariables = { ref?: string }
export type ProjectDetail = components['schemas']['ProjectDetailResponse']
export interface Project extends Omit<ProjectDetail, 'status'> {
  /**
   * postgrestStatus is available on client side only.
   * We use this status to check if a project instance is HEALTHY or not
   * If not we will show ConnectingState and run a polling until it's back online
   */
  postgrestStatus?: 'ONLINE' | 'OFFLINE'
  status: ProjectDetail['status']
  // B5 local extension — CP-only fields not in upstream's generated platform.d.ts
  // (codegen sources upstream's API; do NOT "fix" by regenerating).
  state?: string
  paused_at?: string | null
  pause_cause?: string | null
  // Async provisioning: null for rows that never went through the
  // asynchronous create path (legacy rows, and every row while the
  // platform's asynchronous accept is off).
  provisioning?: ProjectProvisioning | null
}

export async function getProjectDetail(
  { ref }: ProjectDetailVariables,
  signal?: AbortSignal,
  headers?: Record<string, string>
) {
  if (!ref) throw new Error('Project ref is required')

  const { data, error } = await get('/platform/projects/{ref}', {
    params: { path: { ref } },
    signal,
    headers,
  })

  if (error) handleError(error)
  return data as Project
}

export type ProjectDetailData = Awaited<ReturnType<typeof getProjectDetail>>
export type ProjectDetailError = ResponseError

/** Statuses during which the detail is re-read every few seconds until it settles. */
export const POLLED_PROJECT_STATUSES: readonly string[] = ['COMING_UP', 'UNKNOWN', 'GOING_DOWN']

/** Statuses that will not change without a user action — never poll on them. */
export const TERMINAL_PROJECT_STATUSES: readonly string[] = ['INIT_FAILED']

/**
 * Keep polling while the project is still moving (building, unknown, or being
 * torn down — the latter ends in a 404 the layout turns into a redirect), or
 * while it has no usable connection string yet. A terminal status wins over
 * the missing connection string: a failed set-up has none, and only a retry
 * (whose mutation refetches the detail) moves it on.
 */
export function shouldPollProjectDetail(
  status: string | undefined,
  connectionString: string | null | undefined
): boolean {
  if (status !== undefined && TERMINAL_PROJECT_STATUSES.includes(status)) return false
  return (
    (status !== undefined && POLLED_PROJECT_STATUSES.includes(status)) ||
    !isValidConnString(connectionString)
  )
}

export const useProjectDetailQuery = <TData = ProjectDetailData>(
  { ref }: ProjectDetailVariables,
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<ProjectDetailData, ProjectDetailError, TData> = {}
) =>
  useQuery<ProjectDetailData, ProjectDetailError, TData>({
    queryKey: projectKeys.detail(ref),
    queryFn: ({ signal }) => getProjectDetail({ ref }, signal),
    enabled: enabled && typeof ref !== 'undefined',
    staleTime: 30 * 1000,
    refetchInterval: (query) => {
      const data = query.state.data
      return shouldPollProjectDetail(data?.status, data?.connectionString) ? 5 * 1000 : false
    },
    ...options,
  })

export function prefetchProjectDetail(client: QueryClient, { ref }: ProjectDetailVariables) {
  return client.fetchQuery({
    queryKey: projectKeys.detail(ref),
    queryFn: ({ signal }) => getProjectDetail({ ref }, signal),
  })
}

export const useInvalidateProjectDetailsQuery = () => {
  const queryClient = useQueryClient()

  const invalidateProjectDetailsQuery = useCallback(
    (ref: string) => {
      return queryClient.invalidateQueries({ queryKey: projectKeys.detail(ref) })
    },
    [queryClient]
  )

  return { invalidateProjectDetailsQuery }
}

export const useSetProjectPostgrestStatus = () => {
  const queryClient = useQueryClient()

  const setProjectPostgrestStatus = (ref: Project['ref'], status: Project['postgrestStatus']) => {
    return queryClient.setQueriesData<Project>(
      { queryKey: projectKeys.detail(ref) },
      (old) => {
        if (!old) return old
        return { ...old, postgrestStatus: status }
      },
      { updatedAt: Date.now() }
    )
  }

  return { setProjectPostgrestStatus }
}

export const useSetProjectStatus = () => {
  const queryClient = useQueryClient()

  const setProjectStatus = ({
    ref,
    slug,
    status,
  }: {
    ref: Project['ref']
    slug?: string
    status: Project['status']
  }) => {
    // Org projects infinite query
    if (slug) {
      queryClient.setQueriesData<{ pageParams: any; pages: OrgProjectsResponse[] } | undefined>(
        { queryKey: projectKeys.infiniteListByOrg(slug) },
        (old) => {
          if (!old) return old
          return {
            ...old,
            pages: old.pages.map((page) => {
              return {
                ...page,
                projects: page.projects.map((project) =>
                  project.ref === ref ? { ...project, status } : project
                ),
              }
            }),
          }
        },
        { updatedAt: Date.now() }
      )
    }

    // Projects infinite query
    queryClient.setQueriesData<{ pageParams: any; pages: OrgProjectsResponse[] } | undefined>(
      { queryKey: projectKeys.infiniteList() },
      (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => {
            return {
              ...page,
              projects: page.projects.map((project) =>
                project.ref === ref ? { ...project, status } : project
              ),
            }
          }),
        }
      },
      { updatedAt: Date.now() }
    )

    // Project details query
    queryClient.setQueriesData<Project>(
      { queryKey: projectKeys.detail(ref) },
      (old) => {
        if (!old) return old
        return { ...old, status }
      },
      { updatedAt: Date.now() }
    )
  }

  return { setProjectStatus }
}

import { useQuery } from '@tanstack/react-query'

import { projectKeys } from './keys'
import type { ProjectProvisioning } from './provisioning'
import { get, handleError } from '@/data/fetchers'
import type { ResponseError, UseCustomQueryOptions } from '@/types'

export type ProjectStatusVariables = {
  projectRef?: string
}

export type ProjectStatusResponse = {
  status: string
  state?: string
  provisioning?: ProjectProvisioning | null
}

export async function getProjectStatus(
  { projectRef }: ProjectStatusVariables,
  signal?: AbortSignal
) {
  if (!projectRef) throw new Error('Project ref is required')

  const { data, error } = await get(`/platform/projects/{ref}/status`, {
    params: { path: { ref: projectRef } },
    signal,
  })

  if (error) handleError(error)
  return data as ProjectStatusResponse
}

export type ProjectStatusData = Awaited<ReturnType<typeof getProjectStatus>>
export type ProjectStatusError = ResponseError

export const useProjectStatusQuery = <TData = ProjectStatusData>(
  { projectRef }: ProjectStatusVariables,
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<ProjectStatusData, ProjectStatusError, TData> = {}
) =>
  useQuery<ProjectStatusData, ProjectStatusError, TData>({
    queryKey: projectKeys.status(projectRef),
    queryFn: ({ signal }) => getProjectStatus({ projectRef }, signal),
    enabled: enabled && typeof projectRef !== 'undefined',
    ...options,
  })

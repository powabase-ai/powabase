import { useQuery } from '@tanstack/react-query'
import { useParams } from 'common'
import { useProjectDetailQuery } from '@/data/projects/project-detail-query'
import { connectionKeys } from './keys'

export interface ProjectConnectionInfo {
  host: string
  port: number
  database: string
  api_url: string
  anon_key: string
  service_role_key: string
}

export function useConnectionInfoQuery(options?: { enabled?: boolean }) {
  const { ref } = useParams()
  const { data: project } = useProjectDetailQuery({ ref })

  return useQuery<ProjectConnectionInfo>({
    queryKey: connectionKeys.info(ref),
    queryFn: async () => {
      if (!project) throw new Error('Missing project')
      // Derive connection info from project detail.
      // URL precedence: externally-callable URL (docker dev) > restUrl > kong_url >
      // app_config.protocol + "://" + app_config.endpoint.
      // Key source: service_api_keys array from /platform/projects/{ref}
      // (see build_project_detail in agentic_control_plane/.../platform_helpers.py).
      const p = project as any
      const appConfig = (p.app_config ?? {}) as { endpoint?: string; protocol?: string; external_api_url?: string }
      const protocol = appConfig.protocol ?? 'http'
      const apiUrl =
        appConfig.external_api_url ||
        p.restUrl ||
        p.kong_url ||
        (appConfig.endpoint ? `${protocol}://${appConfig.endpoint}` : '')
      const keys = Array.isArray(p.service_api_keys)
        ? (p.service_api_keys as Array<{ name?: string; tags?: string; api_key?: string }>)
        : []
      const anonKey =
        p.anon_key ??
        keys.find((k) => k.tags === 'anon' || k.name === 'anon')?.api_key ??
        ''
      const serviceKey =
        p.service_role_key ??
        p.serviceKey ??
        keys.find((k) => k.tags === 'service_role' || k.name === 'service_role')?.api_key ??
        ''
      return {
        host: p.db_host ?? '',
        port: p.db_port ?? 5432,
        database: p.db_name ?? 'postgres',
        api_url: apiUrl,
        anon_key: anonKey,
        service_role_key: serviceKey,
      }
    },
    enabled: options?.enabled !== false && !!project,
    staleTime: 5 * 60 * 1000,
  })
}

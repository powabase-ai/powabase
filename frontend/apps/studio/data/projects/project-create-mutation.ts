import { useMutation } from '@tanstack/react-query'
import { hasConsented } from 'common'
import { toast } from 'sonner'

import { DesiredInstanceSize, PostgresEngine, ReleaseChannel } from './new-project.constants'
import { useInvalidateProjectsInfiniteQuery } from './org-projects-infinite-query'
import type { components } from '@/data/api'
import { handleError, post } from '@/data/fetchers'
import { PROVIDERS } from '@/lib/constants'
import { captureCriticalError } from '@/lib/error-reporting'
import type { ResponseError, UseCustomMutationOptions } from '@/types'

type CreateProjectBody = components['schemas']['CreateProjectBody']
type CloudProvider = CreateProjectBody['cloud_provider']

// Upstream Supabase OpenAPI schema doesn't include our LLM keys;
// extending locally rather than regenerating. B2 adds `compute_size_id`
// the same way — the CP create route accepts it (Task 3.3) but the FE
// OpenAPI types haven't been regenerated, so it's a local extension.
type CreateProjectBodyWithKeys = CreateProjectBody & {
  ai_provider_keys: {
    openai?: string | null
    anthropic?: string | null
    google?: string | null
    openrouter?: string | null
  }
  compute_size_id?: string
}

export type ProjectCreateVariables = {
  name: string
  organizationSlug: string
  dbPass: string
  dbRegion?: string
  regionSelection?: CreateProjectBody['region_selection']
  dbSql?: string
  dbPricingTierId?: string
  cloudProvider?: string
  authSiteUrl?: string
  customSupabaseRequest?: object
  dbInstanceSize?: DesiredInstanceSize
  dataApiExposedSchemas?: string[]
  dataApiUseApiSchema?: boolean
  postgresEngine?: PostgresEngine
  releaseChannel?: ReleaseChannel
  highAvailability?: boolean
  aiProviderKeys?: {
    openai?: string
    anthropic?: string
    google?: string
    openrouter?: string
  }
  // B2 compute-tier (one of the platform.compute_sizes ids: nano/micro/small/
  // medium/large). The CP create route defaults to 'nano' when omitted.
  computeSizeId?: string
}

export async function createProject({
  name,
  organizationSlug,
  dbPass,
  dbRegion,
  regionSelection,
  dbSql,
  cloudProvider = PROVIDERS.AWS.id,
  authSiteUrl,
  customSupabaseRequest,
  dbInstanceSize,
  dataApiExposedSchemas,
  dataApiUseApiSchema,
  postgresEngine,
  releaseChannel,
  highAvailability,
  aiProviderKeys = {},
  computeSizeId,
}: ProjectCreateVariables) {
  const body: CreateProjectBodyWithKeys = {
    cloud_provider: cloudProvider as CloudProvider,
    organization_slug: organizationSlug,
    name,
    db_pass: dbPass,
    db_region: dbRegion,
    region_selection: regionSelection,
    db_sql: dbSql,
    auth_site_url: authSiteUrl,
    ...(customSupabaseRequest !== undefined && {
      custom_supabase_internal_requests: customSupabaseRequest as any,
    }),
    desired_instance_size: dbInstanceSize,
    data_api_exposed_schemas: dataApiExposedSchemas,
    data_api_use_api_schema: dataApiUseApiSchema,
    postgres_engine: postgresEngine,
    release_channel: releaseChannel,
    high_availability: highAvailability,
    ai_provider_keys: {
      openai: aiProviderKeys.openai || null,
      anthropic: aiProviderKeys.anthropic || null,
      google: aiProviderKeys.google || null,
      openrouter: aiProviderKeys.openrouter || null,
    },
    ...(computeSizeId !== undefined && { compute_size_id: computeSizeId }),
  }

  const { data, error } = await post(`/platform/projects`, {
    body,
  })

  if (error) handleError(error)
  return data
}

type ProjectCreateData = Awaited<ReturnType<typeof createProject>>

export const useProjectCreateMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<ProjectCreateData, ResponseError, ProjectCreateVariables>,
  'mutationFn'
> = {}) => {
  const { invalidateProjectsQuery } = useInvalidateProjectsInfiniteQuery()

  return useMutation<ProjectCreateData, ResponseError, ProjectCreateVariables>({
    mutationFn: (vars) => createProject(vars),
    async onSuccess(data, variables, context) {
      await invalidateProjectsQuery()
      // Gate on current consent — once pixel.js has loaded, removing the
      // <Script> tag doesn't unload it from the browser, so accept → deny
      // within the same tab would otherwise keep sending events to Reddit
      // until full page reload.
      if (typeof window !== 'undefined' && hasConsented()) {
        window.rdt?.('track', 'Lead')
      }
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to create new project: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
      captureCriticalError(data, 'create project')
    },
    ...options,
  })
}

import { useIsFeatureEnabled } from '@/hooks/misc/useIsFeatureEnabled'

/**
 * Resolves the feature gates guide sequences may declare (`GuideSequence.featureGate`)
 * to booleans, keyed by the raw `useIsFeatureEnabled` key. The array form returns
 * camelCased keys, so we remap. Keep in sync with SUPPORTED_GATES in the registry test.
 */
export function useGuideFeatureGates(): Record<string, boolean> {
  const { projectAuthAll, projectStorageAll, realtimeAll, databaseRoles } = useIsFeatureEnabled([
    'project_auth:all',
    'project_storage:all',
    'realtime:all',
    'database:roles',
  ])
  return {
    'project_auth:all': projectAuthAll,
    'project_storage:all': projectStorageAll,
    'realtime:all': realtimeAll,
    'database:roles': databaseRoles,
  }
}

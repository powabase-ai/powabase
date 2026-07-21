import { useQuery } from '@tanstack/react-query'
import { useParams } from 'common'
import { hasAiAuth } from '@/lib/ai-api'
import { storageApi, StorageBucket, StorageObject } from '@/lib/ai-api/storage'
import { storageKeys } from './keys'
import { useSessionAccessTokenQuery } from '@/data/auth/session-access-token-query'

export function useBucketsQuery(options?: { enabled?: boolean }) {
  const { ref } = useParams()
  const { data: token } = useSessionAccessTokenQuery()
  return useQuery<StorageBucket[]>({
    queryKey: storageKeys.buckets(ref),
    queryFn: async () => {
      if (!ref || !hasAiAuth(token)) throw new Error('Missing ref or token')
      // Self-host: token is legitimately '' | null | undefined here — hasAiAuth
      // (not a type predicate) already proved that's OK; storageApi routes to
      // the local self-hosted storage backend instead, which needs no token.
      return storageApi.listBuckets(token!, ref as string)
    },
    enabled: options?.enabled !== false && !!ref && hasAiAuth(token),
    staleTime: 30 * 1000,
  })
}

export function useObjectsQuery(bucketId: string, path: string, options?: { enabled?: boolean }) {
  const { ref } = useParams()
  const { data: token } = useSessionAccessTokenQuery()
  return useQuery<StorageObject[]>({
    queryKey: storageKeys.objects(ref, bucketId, path),
    queryFn: async () => {
      if (!ref || !hasAiAuth(token)) throw new Error('Missing ref or token')
      return storageApi.listObjects(token!, ref as string, bucketId, path)
    },
    enabled: options?.enabled !== false && !!ref && !!bucketId && hasAiAuth(token),
    staleTime: 15 * 1000,
  })
}

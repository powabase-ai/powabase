import { api, API_URL, SessionExpiredError } from '@/lib/ai-api'
import { IS_PLATFORM } from '@/lib/constants'

export interface StorageBucket {
  id: string
  name: string
  public: boolean
  file_size_limit: number | null
  allowed_mime_types: string[] | null
  created_at: string
  updated_at: string
}

export interface StorageObject {
  name: string
  id: string | null
  metadata: Record<string, unknown> | null
  created_at: string | null
  updated_at: string | null
  last_accessed_at: string | null
}

/** Build URL for the platform storage proxy — same pattern as pg-meta and rest proxies. */
function storageUrl(ref: string, path: string): string {
  return `${API_URL}/platform/storage/${ref}${path}`
}

/**
 * Self-host has no control plane, so `storageUrl()` above (which the platform
 * branch below still uses, unchanged) is unreachable. Unlike the AI project-api
 * proxy (getProjectApiBaseUrl), there's no need to build a new proxy here:
 * upstream Supabase Studio already ships a same-origin, service_role-backed
 * self-hosted storage backend at pages/api/platform/storage/[ref]/buckets/**
 * (the same routes the native, non-AI Storage feature uses via data/fetchers.ts).
 * apiWrapper only enforces auth `if (IS_PLATFORM && withAuth)`, and these routes
 * don't even pass `withAuth`, so no token is needed here — matching hasAiAuth's
 * self-host semantics. The two backends speak different path/body shapes for
 * the same operation (storage-api's native singular `/bucket`, `/object/list/{id}`
 * vocabulary vs. Studio's own translated `/buckets`, `/buckets/{id}/objects/list`
 * vocabulary), so each function branches rather than swapping just a base URL.
 */
function selfHostStorageUrl(ref: string, path: string): string {
  return `/api/platform/storage/${ref}${path}`
}

export const storageApi = {
  listBuckets: (token: string, ref: string) =>
    IS_PLATFORM
      ? api<StorageBucket[]>(storageUrl(ref, '/bucket'), { token })
      : api<StorageBucket[]>(selfHostStorageUrl(ref, '/buckets')),

  listObjects: (
    token: string, ref: string, bucketId: string, path: string,
    options?: { limit?: number; offset?: number; sortBy?: { column: string; order: string } }
  ) =>
    IS_PLATFORM
      ? api<StorageObject[]>(storageUrl(ref, `/object/list/${bucketId}`), {
          method: 'POST',
          body: { prefix: path, limit: 100, offset: 0, ...options },
          token,
        })
      : api<StorageObject[]>(selfHostStorageUrl(ref, `/buckets/${bucketId}/objects/list`), {
          method: 'POST',
          body: { path, options: { limit: 100, offset: 0, ...options } },
        }),

  uploadFile: async (token: string, ref: string, bucketId: string, filePath: string, file: File) => {
    const url = storageUrl(ref, `/object/${bucketId}/${filePath}`)
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': file.type || 'application/octet-stream',
      },
      body: file,
    })
    if (res.status === 401) throw new SessionExpiredError()
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
    return res.json()
  },

  downloadFile: async (token: string, ref: string, bucketId: string, filePath: string) => {
    if (!IS_PLATFORM) {
      const res = await fetch(selfHostStorageUrl(ref, `/buckets/${bucketId}/objects/download`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath }),
      })
      if (!res.ok) throw new Error(`Download failed: ${res.status}`)
      return res.blob()
    }
    const res = await fetch(storageUrl(ref, `/object/${bucketId}/${filePath}`), {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    if (res.status === 401) throw new SessionExpiredError()
    if (!res.ok) throw new Error(`Download failed: ${res.status}`)
    return res.blob()
  },
}

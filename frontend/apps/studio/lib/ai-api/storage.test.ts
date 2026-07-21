import { beforeEach, describe, expect, it, vi } from 'vitest'

// storageApi reads IS_PLATFORM (@/lib/constants) at import time (indirectly,
// via lib/ai-api.ts's IS_PLATFORM import), so every test that varies
// NEXT_PUBLIC_IS_PLATFORM must vi.resetModules() + re-import fresh —
// mirrors lib/ai-api.test.ts's established pattern for the same reason.
//
// Unlike the AI project-api proxy (getProjectApiBaseUrl / hasAiAuth), storage
// has no NEW self-host proxy: it reuses upstream Studio's pre-existing
// self-hosted storage backend (pages/api/platform/storage/[ref]/buckets/**).
// These tests pin the two backends' distinct path/body shapes so a future
// edit can't silently swap one branch's target and break the other.

async function loadStorageApi() {
  const mod = await import('./storage')
  return mod.storageApi
}

function mockJsonResponse(body: unknown) {
  return {
    status: 200,
    ok: true,
    text: async () => JSON.stringify(body),
  }
}

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  global.fetch = vi.fn()
})

describe('storageApi.listBuckets', () => {
  it('self-host (IS_PLATFORM=false): GETs the native self-hosted buckets route, same-origin, no Authorization header', async () => {
    vi.stubEnv('NEXT_PUBLIC_IS_PLATFORM', 'false')
    ;(global.fetch as any).mockResolvedValueOnce(mockJsonResponse([]))
    const storageApi = await loadStorageApi()

    await storageApi.listBuckets('', 'default')

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (global.fetch as any).mock.calls[0]
    expect(url).toBe('/api/platform/storage/default/buckets')
    expect(init.headers.Authorization).toBeUndefined()
  })

  it('platform (IS_PLATFORM=true): unchanged — GETs the control-plane proxy with the storage-api-native singular /bucket path + Bearer token', async () => {
    vi.stubEnv('NEXT_PUBLIC_IS_PLATFORM', 'true')
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://cp-backend.test/api')
    ;(global.fetch as any).mockResolvedValueOnce(mockJsonResponse([]))
    const storageApi = await loadStorageApi()

    await storageApi.listBuckets('a-real-gotrue-jwt', 'abcdef')

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (global.fetch as any).mock.calls[0]
    expect(url).toBe('http://cp-backend.test/api/platform/storage/abcdef/bucket')
    expect(init.headers.Authorization).toBe('Bearer a-real-gotrue-jwt')
  })
})

describe('storageApi.listObjects', () => {
  it('self-host: POSTs to buckets/{id}/objects/list with the Studio-native {path, options} body shape', async () => {
    vi.stubEnv('NEXT_PUBLIC_IS_PLATFORM', 'false')
    ;(global.fetch as any).mockResolvedValueOnce(mockJsonResponse([]))
    const storageApi = await loadStorageApi()

    await storageApi.listObjects('', 'default', 'my-bucket', 'sources/')

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (global.fetch as any).mock.calls[0]
    expect(url).toBe('/api/platform/storage/default/buckets/my-bucket/objects/list')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      path: 'sources/',
      options: { limit: 100, offset: 0 },
    })
    expect(init.headers.Authorization).toBeUndefined()
  })

  it('platform: unchanged — POSTs to /object/list/{id} with the storage-api-native {prefix, ...} body shape + token', async () => {
    vi.stubEnv('NEXT_PUBLIC_IS_PLATFORM', 'true')
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://cp-backend.test/api')
    ;(global.fetch as any).mockResolvedValueOnce(mockJsonResponse([]))
    const storageApi = await loadStorageApi()

    await storageApi.listObjects('a-real-gotrue-jwt', 'abcdef', 'my-bucket', 'sources/')

    const [url, init] = (global.fetch as any).mock.calls[0]
    expect(url).toBe('http://cp-backend.test/api/platform/storage/abcdef/object/list/my-bucket')
    expect(JSON.parse(init.body)).toEqual({ prefix: 'sources/', limit: 100, offset: 0 })
    expect(init.headers.Authorization).toBe('Bearer a-real-gotrue-jwt')
  })
})

describe('storageApi.downloadFile', () => {
  it('self-host: POSTs to buckets/{id}/objects/download with a JSON {path} body and no Authorization header', async () => {
    vi.stubEnv('NEXT_PUBLIC_IS_PLATFORM', 'false')
    const blob = new Blob(['file bytes'])
    ;(global.fetch as any).mockResolvedValueOnce({ ok: true, blob: async () => blob })
    const storageApi = await loadStorageApi()

    const result = await storageApi.downloadFile('', 'default', 'my-bucket', 'a/b.png')

    expect(result).toBe(blob)
    const [url, init] = (global.fetch as any).mock.calls[0]
    expect(url).toBe('/api/platform/storage/default/buckets/my-bucket/objects/download')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ path: 'a/b.png' })
    expect(init.headers.Authorization).toBeUndefined()
  })

  it('platform: unchanged — GETs the storage-api-native /object/{id}/{path} route with Bearer token', async () => {
    vi.stubEnv('NEXT_PUBLIC_IS_PLATFORM', 'true')
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://cp-backend.test/api')
    const blob = new Blob(['file bytes'])
    ;(global.fetch as any).mockResolvedValueOnce({ status: 200, ok: true, blob: async () => blob })
    const storageApi = await loadStorageApi()

    const result = await storageApi.downloadFile('a-real-gotrue-jwt', 'abcdef', 'my-bucket', 'a/b.png')

    expect(result).toBe(blob)
    const [url, init] = (global.fetch as any).mock.calls[0]
    expect(url).toBe('http://cp-backend.test/api/platform/storage/abcdef/object/my-bucket/a/b.png')
    expect(init.headers.Authorization).toBe('Bearer a-real-gotrue-jwt')
  })
})

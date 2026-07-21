import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getDatabasePolicies } from './database-policies-query'

vi.mock('@/data/fetchers', () => ({
  get: vi.fn(),
  handleError: vi.fn((error) => {
    throw error
  }),
}))

// useSelectedProjectQuery pulls in `common` → feature-flags → `flags/react` (not resolvable in tests).
// getDatabasePolicies doesn't use the hook, but the hook is re-exported from the same module.
vi.mock('@/hooks/misc/useSelectedProject', () => ({
  useSelectedProjectQuery: vi.fn(),
}))

describe('database-policies-query', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getDatabasePolicies', () => {
    it('throws error when projectRef is not provided', async () => {
      await expect(getDatabasePolicies({ projectRef: undefined })).rejects.toThrow(
        'projectRef is required'
      )
    })

    it('does not send empty included_schemas or excluded_schemas when schema is not provided', async () => {
      // Regression test for https://github.com/.../issues/95
      // Empty-string filter values cause pg-meta to interpret them as IN ('') which matches no schemas,
      // so the Policies page was showing "no RLS policies exist" for projects that do have policies.
      const { get } = await import('@/data/fetchers')
      const mockGet = get as unknown as ReturnType<typeof vi.fn>
      mockGet.mockResolvedValueOnce({ data: [], error: null })

      await getDatabasePolicies({ projectRef: 'test-ref', connectionString: 'conn' })

      const call = mockGet.mock.calls[0]
      const query = call[1].params.query
      expect(query?.included_schemas).not.toBe('')
      expect(query?.excluded_schemas).not.toBe('')
    })

    it('sends included_schemas when schema is provided', async () => {
      const { get } = await import('@/data/fetchers')
      const mockGet = get as unknown as ReturnType<typeof vi.fn>
      mockGet.mockResolvedValueOnce({ data: [], error: null })

      await getDatabasePolicies({
        projectRef: 'test-ref',
        connectionString: 'conn',
        schema: 'storage',
      })

      const call = mockGet.mock.calls[0]
      expect(call[1].params.query).toEqual(
        expect.objectContaining({ included_schemas: 'storage' })
      )
    })
  })
})

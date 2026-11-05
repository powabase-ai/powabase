import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getSignUpInviteRequired,
  useSignUpInviteRequiredQuery,
} from './signup-invite-required-query'
import { API_URL } from '@/lib/constants'
import { ResponseError } from '@/types'

const { fetchGetMock, mockIsPlatform } = vi.hoisted(() => ({
  fetchGetMock: vi.fn(),
  mockIsPlatform: { value: true },
}))

vi.mock('@/data/fetchers', () => ({
  fetchGet: fetchGetMock,
}))

vi.mock('@/lib/constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/constants')>()
  return {
    ...actual,
    get IS_PLATFORM() {
      return mockIsPlatform.value
    },
  }
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
)

describe('getSignUpInviteRequired', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GETs the platform API invite-required endpoint with a timeout signal', async () => {
    fetchGetMock.mockResolvedValue({ required: true })

    await expect(getSignUpInviteRequired()).resolves.toEqual({ required: true })

    expect(fetchGetMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchGetMock.mock.calls[0]
    expect(url).toBe(`${API_URL}/platform/signup/invite/required`)
    expect(options.abortSignal).toBeInstanceOf(AbortSignal)
  })

  it('only treats an explicit `required: true` as required', async () => {
    fetchGetMock.mockResolvedValue({ required: false })
    await expect(getSignUpInviteRequired()).resolves.toEqual({ required: false })

    fetchGetMock.mockResolvedValue({})
    await expect(getSignUpInviteRequired()).resolves.toEqual({ required: false })

    fetchGetMock.mockResolvedValue({ required: 'yes' })
    await expect(getSignUpInviteRequired()).resolves.toEqual({ required: false })
  })

  it('throws the ResponseError when the request fails', async () => {
    const error = new ResponseError('boom', 503)
    fetchGetMock.mockResolvedValue(error)

    await expect(getSignUpInviteRequired()).rejects.toBe(error)
  })
})

describe('useSignUpInviteRequiredQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not ask the platform API outside the hosted platform', async () => {
    mockIsPlatform.value = false
    fetchGetMock.mockResolvedValue({ required: true })

    const { result } = renderHook(() => useSignUpInviteRequiredQuery(), { wrapper })
    await new Promise((r) => setTimeout(r, 20))

    expect(fetchGetMock).not.toHaveBeenCalled()
    expect(result.current.fetchStatus).toBe('idle')
    expect(result.current.isLoading).toBe(false)
  })

  it('fetches on the hosted platform', async () => {
    mockIsPlatform.value = true
    fetchGetMock.mockResolvedValue({ required: true })

    const { result } = renderHook(() => useSignUpInviteRequiredQuery(), { wrapper })

    await waitFor(() => expect(result.current.data).toEqual({ required: true }))
    expect(fetchGetMock).toHaveBeenCalledTimes(1)
  })

  it('does not retry a failed check, so the page can fall back quickly', async () => {
    mockIsPlatform.value = true
    fetchGetMock.mockResolvedValue(new ResponseError('boom', 500))

    const { result } = renderHook(() => useSignUpInviteRequiredQuery(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(fetchGetMock).toHaveBeenCalledTimes(1)
  })
})

import { renderHook } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionExpiryRedirect } from '@/hooks/useSessionExpiryRedirect'
import { queryClient } from '@/lib/queryClient'
import { apiFetch } from '@/lib/tanstackApi'
import { server } from '../setup.js'

const goToLogin = vi.hoisted(() => vi.fn())

vi.mock('@/lib/session-expiry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session-expiry')>()),
  goToLogin,
}))

const unauthorized = () =>
  HttpResponse.json(
    {
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Authentication required',
    },
    { status: 401 },
  )

beforeEach(() => {
  goToLogin.mockClear()
  server.use(
    http.get('/v1/config', unauthorized),
    http.get('/v1/users/check', unauthorized),
  )
})

afterEach(() => {
  queryClient.clear()
})

describe('useSessionExpiryRedirect', () => {
  it('clears the cache and goes to login once when calls answer 401', async () => {
    queryClient.setQueryData(['cached'], 'value')
    renderHook(() => useSessionExpiryRedirect())

    await Promise.all([
      apiFetch.GET('/v1/config'),
      apiFetch.GET('/v1/users/check'),
    ])

    expect(goToLogin).toHaveBeenCalledOnce()
    expect(queryClient.getQueryData(['cached'])).toBeUndefined()
  })

  it('stops reacting once unmounted', async () => {
    const { unmount } = renderHook(() => useSessionExpiryRedirect())
    unmount()

    await apiFetch.GET('/v1/config')

    expect(goToLogin).not.toHaveBeenCalled()
  })
})

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useOperation } from '@/hooks/useOperation'
import { NAV_PAGES } from '@/lib/navigation'

const meta = { label: 'Test run', page: NAV_PAGES.userTags }

function wrapperFor(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

function useTestOperation(mutationFn: () => Promise<{ count: number }>) {
  return useOperation({
    key: ['test', 'run'],
    mutationFn,
    meta,
    errorFallback: 'Run failed.',
  })
}

describe('useOperation', () => {
  it('exposes the result once the run resolves', async () => {
    const wrapper = wrapperFor(new QueryClient())
    const { result } = renderHook(
      () => useTestOperation(async () => ({ count: 3 })),
      { wrapper },
    )

    act(() => result.current.run())

    await waitFor(() =>
      expect(result.current.result?.data).toEqual({ count: 3 }),
    )
    expect(result.current.errorMessage).toBeNull()
  })

  it('keeps the result for a hook mounted after the first unmounts', async () => {
    const wrapper = wrapperFor(new QueryClient())
    const first = renderHook(
      () => useTestOperation(async () => ({ count: 5 })),
      { wrapper },
    )
    act(() => first.result.current.run())
    await waitFor(() => expect(first.result.current.result).not.toBeNull())
    first.unmount()

    const second = renderHook(
      () => useTestOperation(async () => ({ count: 0 })),
      { wrapper },
    )

    expect(second.result.current.result?.data).toEqual({ count: 5 })
  })

  it('reports an error and no result when the run rejects', async () => {
    const wrapper = wrapperFor(new QueryClient())
    const { result } = renderHook(
      () =>
        useTestOperation(async () => {
          throw { message: 'Server said no' }
        }),
      { wrapper },
    )

    act(() => result.current.run())

    await waitFor(() =>
      expect(result.current.errorMessage).toBe('Server said no'),
    )
    expect(result.current.result).toBeNull()
  })
})

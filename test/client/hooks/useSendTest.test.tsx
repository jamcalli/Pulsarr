import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useSendTest } from '@/hooks/useSendTest'

function wrapperFor(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

const passed = { success: true, responseTime: 12 }

describe('useSendTest', () => {
  it('drops the result once the value changes', async () => {
    const wrapper = wrapperFor(new QueryClient())
    const { result, rerender } = renderHook(
      ({ value }) => useSendTest(async (_url: string) => passed, value),
      { wrapper, initialProps: { value: 'a' } },
    )

    act(() => result.current.run('a'))
    await waitFor(() => expect(result.current.outcome).toEqual(passed))

    rerender({ value: 'b' })
    expect(result.current.outcome).toBeNull()
    expect(result.current.ranAt).toBeNull()
  })

  it('drops the result once the value clears to null', async () => {
    const wrapper = wrapperFor(new QueryClient())
    const initialProps: { value: number | null } = { value: 7 }
    const { result, rerender } = renderHook(
      ({ value }) => useSendTest(async (_userId: number) => passed, value),
      { wrapper, initialProps },
    )

    act(() => result.current.run(7))
    await waitFor(() => expect(result.current.outcome).toEqual(passed))

    rerender({ value: null })
    expect(result.current.outcome).toBeNull()
  })

  it('keeps the result for a new value the equality function matches', async () => {
    const wrapper = wrapperFor(new QueryClient())
    const sameUrl = (a: { url: string }, b: { url: string }) => a.url === b.url
    const { result, rerender } = renderHook(
      ({ value }) =>
        useSendTest(async (_target: { url: string }) => passed, value, sameUrl),
      { wrapper, initialProps: { value: { url: 'a' } } },
    )

    act(() => result.current.run({ url: 'a' }))
    await waitFor(() => expect(result.current.outcome).toEqual(passed))

    rerender({ value: { url: 'a' } })
    expect(result.current.outcome).toEqual(passed)
    rerender({ value: { url: 'b' } })
    expect(result.current.outcome).toBeNull()
  })

  it('turns a thrown send into a failed outcome', async () => {
    const wrapper = wrapperFor(new QueryClient())
    const { result } = renderHook(
      () =>
        useSendTest(async (_url: string) => {
          throw new Error('offline')
        }, 'a'),
      { wrapper },
    )

    act(() => result.current.run('a'))
    await waitFor(() =>
      expect(result.current.outcome).toMatchObject({ success: false }),
    )
  })
})

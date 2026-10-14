import { act, renderHook } from '@testing-library/react'
import { useScopedSelection } from '@/hooks/useScopedSelection'

function renderSelection(scope: string) {
  return renderHook(
    ({ scope }: { scope: string }) => useScopedSelection(scope),
    {
      initialProps: { scope },
    },
  )
}

describe('useScopedSelection', () => {
  it('starts empty when returning to a scope that had a selection', () => {
    const { result, rerender } = renderSelection('A')

    act(() => result.current.select({ '1': true }))
    expect(result.current.rows).toEqual({ '1': true })

    rerender({ scope: 'B' })
    expect(result.current.rows).toEqual({})

    rerender({ scope: 'A' })
    expect(result.current.rows).toEqual({})
    expect(result.current.failure).toBeNull()
  })

  it('ignores a settle from a scope that is no longer current', () => {
    const { result, rerender } = renderSelection('A')
    const settleInA = result.current.settle
    const setFailureInA = result.current.setFailure

    rerender({ scope: 'B' })
    act(() => result.current.select({ '7': true }))

    act(() => settleInA([1, 2], { message: 'Failed', detail: null }))
    act(() => setFailureInA({ message: 'Failed', detail: null }))

    expect(result.current.rows).toEqual({ '7': true })
    expect(result.current.failure).toBeNull()
  })

  it('ignores a settle from an earlier visit to the same scope', () => {
    const { result, rerender } = renderSelection('A')
    const settleInFirstVisit = result.current.settle

    rerender({ scope: 'B' })
    rerender({ scope: 'A' })
    act(() => result.current.select({ '7': true }))

    act(() => settleInFirstVisit([1, 2], { message: 'Failed', detail: null }))

    expect(result.current.rows).toEqual({ '7': true })
    expect(result.current.failure).toBeNull()
  })

  it('settles the current scope to the given ids', () => {
    const { result } = renderSelection('A')
    const failure = { message: 'Failed', detail: null }

    act(() => result.current.select({ '1': true, '2': true, '3': true }))
    act(() => result.current.settle([2], failure))

    expect(result.current.rows).toEqual({ '2': true })
    expect(result.current.failure).toEqual(failure)
  })
})

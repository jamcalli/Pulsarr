import { act, renderHook } from '@testing-library/react'
import { useIntent } from '@/hooks/useIntent'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useIntent', () => {
  it('fires once the pointer has rested past the delay', () => {
    const onIntent = vi.fn()
    const { result } = renderHook(() => useIntent(onIntent))

    act(() => result.current.onPointerEnter())
    act(() => vi.advanceTimersByTime(149))
    expect(onIntent).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(1))
    expect(onIntent).toHaveBeenCalledTimes(1)
  })

  it('cancels when the pointer leaves before the delay', () => {
    const onIntent = vi.fn()
    const { result } = renderHook(() => useIntent(onIntent))

    act(() => result.current.onPointerEnter())
    act(() => result.current.onPointerLeave())
    act(() => vi.advanceTimersByTime(500))

    expect(onIntent).not.toHaveBeenCalled()
  })

  it('treats keyboard focus as intent and cancels on blur', () => {
    const onIntent = vi.fn()
    const { result } = renderHook(() => useIntent(onIntent))

    act(() => result.current.onFocus())
    act(() => result.current.onBlur())
    act(() => vi.advanceTimersByTime(500))
    expect(onIntent).not.toHaveBeenCalled()

    act(() => result.current.onFocus())
    act(() => vi.advanceTimersByTime(150))
    expect(onIntent).toHaveBeenCalledTimes(1)
  })
})

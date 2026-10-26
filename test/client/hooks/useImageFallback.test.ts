import { act, renderHook } from '@testing-library/react'
import { useImageFallback } from '@/hooks/useImageFallback'

describe('useImageFallback', () => {
  it('drops a src that failed and keeps the next one', () => {
    const { result, rerender } = renderHook(
      ({ src }: { src: string | null }) => useImageFallback(src),
      { initialProps: { src: '/a.jpg' } },
    )
    expect(result.current.src).toBe('/a.jpg')

    act(() => result.current.onError())
    expect(result.current.src).toBeNull()

    rerender({ src: '/b.jpg' })
    expect(result.current.src).toBe('/b.jpg')
  })

  it('passes a missing src through', () => {
    const { result } = renderHook(() => useImageFallback(null))
    expect(result.current.src).toBeNull()
  })
})

import { renderHook } from '@testing-library/react'
import { useBreadcrumbTail } from '@/hooks/useBreadcrumbTail'
import { useBreadcrumbStore } from '@/stores/breadcrumbStore'

describe('useBreadcrumbTail', () => {
  afterEach(() => {
    useBreadcrumbStore.setState({ tail: null })
  })

  it('sets the tail while mounted and clears it on unmount', () => {
    const { unmount } = renderHook(() => useBreadcrumbTail('Maya R.'))
    expect(useBreadcrumbStore.getState().tail).toBe('Maya R.')

    unmount()
    expect(useBreadcrumbStore.getState().tail).toBeNull()
  })

  it('follows a changed tail', () => {
    const { rerender } = renderHook(({ tail }) => useBreadcrumbTail(tail), {
      initialProps: { tail: 'Maya R.' },
    })

    rerender({ tail: 'Maya Rivera' })
    expect(useBreadcrumbStore.getState().tail).toBe('Maya Rivera')
  })
})

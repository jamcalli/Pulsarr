import { act, renderHook } from '@testing-library/react'
import { useMediaSelection } from '@/features/home/hooks/useMediaSelection'
import type { MediaItem } from '@/features/home/lib/media-item'

const snapshot: MediaItem = {
  title: 'Dune',
  type: 'movie',
  guids: ['tmdb:438631'],
  thumb: null,
}

describe('useMediaSelection', () => {
  it('shows the live item when the resolver returns a newer one', () => {
    let live: MediaItem | undefined = snapshot
    const { result, rerender } = renderHook(() => useMediaSelection(() => live))

    act(() => result.current.select('movie:Dune', snapshot))
    live = { ...snapshot, thumb: '/fresh.jpg' }
    rerender()

    expect(result.current.selection?.item.thumb).toBe('/fresh.jpg')
    expect(result.current.selection?.open).toBe(true)
  })

  it('falls back to the snapshot when the key no longer resolves', () => {
    const { result } = renderHook(() => useMediaSelection(() => undefined))

    act(() => result.current.select('movie:Dune', snapshot))
    act(() => result.current.setOpen(false))

    expect(result.current.selection).toEqual({ item: snapshot, open: false })
  })

  it('has no selection before anything is picked', () => {
    const { result } = renderHook(() => useMediaSelection(() => snapshot))

    expect(result.current.selection).toBeNull()
  })
})

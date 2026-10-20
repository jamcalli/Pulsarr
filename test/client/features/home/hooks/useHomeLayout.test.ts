import { act, renderHook } from '@testing-library/react'
import { useHomeLayout } from '@/features/home/hooks/useHomeLayout'

describe('useHomeLayout', () => {
  it('stores rows normalized', () => {
    const { result } = renderHook(() => useHomeLayout())

    act(() =>
      result.current.setRows([
        ['approvals', 'most-active', 'library-mix'],
        [],
        ['pipeline', 'notifications'],
      ]),
    )

    expect(result.current.layout.rows).toEqual([
      ['approvals', 'most-active'],
      ['library-mix'],
      ['pipeline'],
      ['notifications'],
    ])
    expect(result.current.isDefault).toBe(false)
  })

  it('puts an unhidden card back in the row it was hidden from', () => {
    const { result } = renderHook(() => useHomeLayout())

    act(() => result.current.setHidden('most-active', true))
    expect(result.current.rows[0]).toEqual({ cards: ['approvals'], fill: true })

    act(() => result.current.setHidden('most-active', false))
    expect(result.current.rows[0]).toEqual({
      cards: ['approvals', 'most-active'],
      fill: true,
    })
    expect(result.current.isDefault).toBe(true)
  })

  it('appends an unhidden card that is in no row as its own row', () => {
    const { result } = renderHook(() => useHomeLayout())

    act(() => result.current.setHidden('pipeline', true))
    act(() =>
      result.current.setRows(result.current.rows.map((row) => [...row.cards])),
    )
    expect(result.current.layout.rows.flat()).not.toContain('pipeline')

    act(() => result.current.setHidden('pipeline', false))

    expect(result.current.layout.rows.at(-1)).toEqual(['pipeline'])
    expect(result.current.rows.at(-1)).toEqual({
      cards: ['pipeline'],
      fill: true,
    })
  })

  it('reads the saved layout back on the next mount', () => {
    const first = renderHook(() => useHomeLayout())
    act(() => first.result.current.setHidden('top-genres', true))

    const { result } = renderHook(() => useHomeLayout())

    expect(result.current.rows).toContainEqual({
      cards: ['library-mix'],
      fill: false,
    })
    expect(result.current.layout.hidden).toEqual(['top-genres'])
  })
})

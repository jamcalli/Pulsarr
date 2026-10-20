import { act, renderHook } from '@testing-library/react'
import { useHomeLayout } from '@/features/home/hooks/useHomeLayout'
import { useLayoutBoard } from '@/features/home/hooks/useLayoutBoard'

const rect = { current: { initial: null, translated: null } }
const start = (id: string) => ({
  active: { id, data: { current: undefined }, rect },
  activatorEvent: new Event('keydown'),
})

function renderBoard() {
  return renderHook(() => {
    const layout = useHomeLayout()
    return { layout, board: useLayoutBoard(layout) }
  })
}

describe('useLayoutBoard', () => {
  it('keys columns by their cards so a moved row keeps its id', () => {
    const { result } = renderBoard()
    expect(Object.keys(result.current.board.columns)[0]).toBe(
      'row:approvals+most-active',
    )
  })

  it('saves the draft on drop', () => {
    const { result } = renderBoard()

    act(() => result.current.board.onDragStart(start('most-active')))
    act(() =>
      result.current.board.onValueChange({
        ...result.current.board.columns,
        'row:approvals+most-active': ['approvals'],
        'new-row': ['most-active'],
      }),
    )
    act(() => result.current.board.onDragEnd())

    expect(result.current.layout.layout.rows[0]).toEqual(['approvals'])
    expect(result.current.layout.layout.rows.at(-1)).toEqual(['most-active'])
  })

  it('drops a stale draft when the layout changes during the drag', () => {
    const { result } = renderBoard()
    act(() => result.current.layout.setHidden('library-mix', true))

    act(() => result.current.board.onDragStart(start('most-active')))
    act(() =>
      result.current.board.onValueChange({
        ...result.current.board.columns,
        'row:approvals+most-active': ['approvals'],
        'new-row': ['most-active'],
      }),
    )
    act(() => result.current.layout.reset())
    act(() => result.current.board.onDragEnd())

    expect(result.current.layout.isDefault).toBe(true)
  })
})

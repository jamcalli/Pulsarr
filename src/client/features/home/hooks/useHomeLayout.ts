import {
  DEFAULT_HOME_ROWS,
  type HomeCardId,
  normalizeRows,
} from '@/features/home/lib/home-layout'
import { homeLayoutPref, visibleRows } from '@/features/home/lib/home-prefs'
import { usePref } from '@/lib/prefs'

export type HomeLayoutState = ReturnType<typeof useHomeLayout>

export function useHomeLayout() {
  const [layout, setLayout] = usePref(homeLayoutPref)

  const setRows = (rows: HomeCardId[][]) =>
    setLayout({ ...layout, rows: normalizeRows(rows).map((row) => row.cards) })

  const setHidden = (id: HomeCardId, hidden: boolean) => {
    const rest = layout.hidden.filter((hiddenId) => hiddenId !== id)
    if (hidden) {
      setLayout({ ...layout, hidden: [...rest, id] })
      return
    }
    const placed = layout.rows.some((row) => row.includes(id))
    const rows = placed ? layout.rows : [...layout.rows, [id]]
    setLayout({ rows, hidden: rest })
  }

  const savedRows = normalizeRows(layout.rows)
  const isDefault =
    layout.hidden.length === 0 &&
    savedRows.length === DEFAULT_HOME_ROWS.length &&
    savedRows.every(
      (row, index) => row.cards.join() === DEFAULT_HOME_ROWS[index].join(),
    )

  return {
    layout,
    rows: visibleRows(layout),
    isDefault,
    setRows,
    setHidden,
    reset: () => setLayout(homeLayoutPref.fallback),
  }
}

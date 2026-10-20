import { Fragment, type ReactNode } from 'react'
import {
  HOME_ROW_GRID,
  type HomeCardId,
  type HomeRow,
} from '@/features/home/lib/home-layout'

export function HomeRows({
  rows,
  renderCard,
}: {
  rows: HomeRow[]
  renderCard: (id: HomeCardId) => ReactNode
}) {
  return rows.map((row) => {
    const key = row.cards.join('+')
    if (row.fill && row.cards.length === 1) {
      return <Fragment key={key}>{renderCard(row.cards[0])}</Fragment>
    }
    return (
      <div key={key} className={HOME_ROW_GRID}>
        {row.cards.map((id) => (
          <Fragment key={id}>{renderCard(id)}</Fragment>
        ))}
      </div>
    )
  })
}

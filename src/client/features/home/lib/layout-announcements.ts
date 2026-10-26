import type { Announcements, UniqueIdentifier } from '@dnd-kit/core'
import { HOME_CARDS } from '@/features/home/lib/home-cards'
import {
  type BoardColumns,
  HOME_CARD_IDS,
  type HomeCardId,
  NEW_ROW_COLUMN,
} from '@/features/home/lib/home-layout'
import { dragAnnouncements } from '@/lib/drag-announcements'
import { formatList } from '@/lib/format'

function cardId(id: UniqueIdentifier): HomeCardId | undefined {
  return HOME_CARD_IDS.find((card) => card === id)
}

/** Screen reader text for board drags, naming cards and rows instead of the kanban's internal column keys. */
export function layoutAnnouncements(columns: BoardColumns): Announcements {
  const keys = Object.keys(columns)
  const rowOf = (id: UniqueIdentifier) =>
    keys.find((key) => key === id || columns[key].some((card) => card === id))
  const rowName = (key: string) =>
    key === NEW_ROW_COLUMN ? 'a new row' : `row ${keys.indexOf(key) + 1}`
  const rowContents = (key: string, except?: HomeCardId) => {
    const labels = (columns[key] ?? [])
      .filter((id) => id !== except)
      .map((id) => HOME_CARDS[id].label)
    return labels.length > 0 ? ` with ${formatList(labels)}` : ''
  }
  const describeRow = (key: string, except?: HomeCardId) =>
    `${rowName(key)}${rowContents(key, except)}`
  const subject = (id: UniqueIdentifier) => {
    const card = cardId(id)
    return card ? HOME_CARDS[card].label : describeRow(String(id))
  }
  const placement = (active: UniqueIdentifier, over: UniqueIdentifier) => {
    const card = cardId(active)
    if (!card)
      return `at row ${keys.indexOf(String(over)) + 1} of ${keys.length}`
    const key = rowOf(over)
    return key ? `in ${describeRow(key, card)}` : 'in its row'
  }

  return dragAnnouncements({ subject, placement })
}

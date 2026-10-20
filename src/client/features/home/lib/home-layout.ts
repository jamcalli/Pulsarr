export const HOME_CARD_IDS = [
  'approvals',
  'most-active',
  'recent-requests',
  'popularity-rankings',
  'pipeline',
  'request-to-ready',
  'top-genres',
  'notifications',
  'library-mix',
] as const

export type HomeCardId = (typeof HOME_CARD_IDS)[number]

export type HomeCardSpan = 'full' | 'half' | 'half-grow'

export const HOME_CARD_SPANS: Record<HomeCardId, HomeCardSpan> = {
  approvals: 'half-grow',
  'most-active': 'half-grow',
  'recent-requests': 'full',
  'popularity-rankings': 'full',
  pipeline: 'full',
  'request-to-ready': 'half',
  'top-genres': 'half-grow',
  notifications: 'half-grow',
  'library-mix': 'half',
}

export const HOME_ROW_GRID =
  'grid grid-cols-1 items-start gap-5 md:grid-cols-2 md:items-stretch'

export type HomeRowCards = [HomeCardId] | [HomeCardId, HomeCardId]

export interface HomeRow {
  cards: HomeRowCards
  fill: boolean
}

export const DEFAULT_HOME_ROWS: readonly HomeRowCards[] = [
  ['approvals', 'most-active'],
  ['recent-requests'],
  ['popularity-rankings'],
  ['pipeline'],
  ['request-to-ready', 'notifications'],
  ['top-genres', 'library-mix'],
]

function toRow(cards: HomeRowCards): HomeRow {
  const fill = cards.length === 2 || HOME_CARD_SPANS[cards[0]] !== 'half'
  return { cards, fill }
}

/** True when the row needs no normalizing, so a drag preview showing it matches what gets saved. */
export function fitsRow(cards: readonly HomeCardId[]): boolean {
  if (cards.length > 2) return false
  return cards.length < 2 || cards.every((id) => HOME_CARD_SPANS[id] !== 'full')
}

/** Splits overfull rows, isolates full cards, drops empties and sets fill from the span rule. */
export function normalizeRows(
  rows: readonly (readonly HomeCardId[])[],
): HomeRow[] {
  const result: HomeRow[] = []
  for (const row of rows) {
    let building: HomeCardId | undefined
    for (const id of row) {
      if (HOME_CARD_SPANS[id] === 'full') {
        if (building) result.push(toRow([building]))
        building = undefined
        result.push(toRow([id]))
      } else if (building) {
        result.push(toRow([building, id]))
        building = undefined
      } else {
        building = id
      }
    }
    if (building) result.push(toRow([building]))
  }
  return result
}

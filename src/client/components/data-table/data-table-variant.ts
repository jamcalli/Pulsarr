/** Framed tables sit on the page in their own card, flat ones sit inside a card or dialog and bleed into its padding so the cell text lines up with it. */
export type DataTableVariant = 'framed' | 'flat'

export const DATA_TABLE_EDGES: Record<
  DataTableVariant,
  { select: string; expand: string; last: string }
> = {
  framed: { select: 'w-px pl-4', expand: 'w-px pr-4', last: 'last:pr-4' },
  flat: { select: 'w-px', expand: 'w-px', last: '' },
}

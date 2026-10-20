import { layoutAnnouncements } from '@/features/home/lib/layout-announcements'

const columns = {
  'row-0': ['approvals', 'most-active'],
  'row-1': ['recent-requests'],
  'row-2': ['request-to-ready'],
  'new-row': [],
} as const

const rect = { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }
const active = (id: string) => ({
  id,
  data: { current: undefined },
  rect: { current: { initial: null, translated: null } },
})
const over = (id: string) => ({
  id,
  data: { current: undefined },
  rect,
  disabled: false,
})

describe('layoutAnnouncements', () => {
  const announce = layoutAnnouncements({
    'row-0': [...columns['row-0']],
    'row-1': [...columns['row-1']],
    'row-2': [...columns['row-2']],
    'new-row': [],
  })

  it('names the card or the row that was picked up', () => {
    expect(announce.onDragStart({ active: active('most-active') })).toBe(
      'Picked up Most active.',
    )
    expect(announce.onDragStart({ active: active('row-0') })).toBe(
      'Picked up row 1 with Needs your approval, Most active.',
    )
  })

  it('says which row a card is over and who it joins', () => {
    expect(
      announce.onDragOver({
        active: active('most-active'),
        over: over('request-to-ready'),
      }),
    ).toBe('Most active is now row 3 with Request to ready.')
    expect(
      announce.onDragOver({
        active: active('most-active'),
        over: over('new-row'),
      }),
    ).toBe('Most active is now a new row.')
  })

  it('reports row moves by position and drops by destination', () => {
    expect(
      announce.onDragEnd({ active: active('row-2'), over: over('row-0') }),
    ).toBe('row 3 with Request to ready was dropped row 1 of 4.')
    expect(
      announce.onDragEnd({ active: active('most-active'), over: null }),
    ).toBe('Most active was dropped back where it was.')
    expect(announce.onDragCancel({ active: active('row-1'), over: null })).toBe(
      'Move cancelled. row 2 with Recent requests went back where it was.',
    )
  })
})

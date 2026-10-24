import { routeAnnouncements } from '@/features/library/lib/content-router/route-announcements'

const rect = { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }
const active = (id: number) => ({
  id,
  data: { current: undefined },
  rect: { current: { initial: null, translated: null } },
})
const over = (id: number | string) => ({
  id,
  data: { current: undefined },
  rect,
  disabled: false,
})

describe('routeAnnouncements', () => {
  const announce = routeAnnouncements(
    [3, 1, 2],
    new Map([
      [1, 'Anime 4K'],
      [2, 'Kids'],
      [3, 'Docs'],
    ]),
  )

  it('names the route that was picked up', () => {
    expect(announce.onDragStart({ active: active(1) })).toBe(
      'Picked up Anime 4K.',
    )
  })

  it('names the position of the route it is over', () => {
    expect(announce.onDragOver({ active: active(1), over: over(1) })).toBe(
      'Anime 4K is now at position 2 of 3.',
    )
    expect(
      announce.onDragOver({ active: active(1), over: over('routes') }),
    ).toBeUndefined()
  })

  it('says where the route was dropped or that it went back', () => {
    expect(announce.onDragEnd({ active: active(2), over: over(3) })).toBe(
      'Kids was dropped at position 1 of 3.',
    )
    expect(announce.onDragEnd({ active: active(2), over: null })).toBe(
      'Kids was dropped back where it was.',
    )
    expect(announce.onDragCancel({ active: active(2), over: null })).toBe(
      'Move cancelled. Kids went back where it was.',
    )
  })
})

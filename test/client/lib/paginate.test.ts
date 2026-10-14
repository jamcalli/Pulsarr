import { paginate } from '@/lib/paginate'

const items = Array.from({ length: 25 }, (_, index) => index + 1)

describe('paginate', () => {
  it('slices the requested page', () => {
    expect(paginate(items, 2, 10)).toEqual({
      page: 2,
      rows: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
    })
  })

  it('clamps a page past the end to the last page', () => {
    expect(paginate(items, 9, 10)).toEqual({
      page: 3,
      rows: [21, 22, 23, 24, 25],
    })
  })

  it('stays on page 1 for an empty list', () => {
    expect(paginate([], 4, 10)).toEqual({ page: 1, rows: [] })
  })

  it('treats a page below 1 as the first page', () => {
    expect(paginate(items, 0, 10).page).toBe(1)
    expect(paginate(items, -3, 10).rows).toHaveLength(10)
  })
})

import {
  chunkExclusions,
  chunkIds,
  mergeOutcomes,
} from '@/features/library/lib/exclusions/exclusion-requests'

function item(key: string, userIds: number[]) {
  return { key, userIds }
}

describe('chunkExclusions', () => {
  it('keeps items whole while the pairs fit the cap', () => {
    const chunks = chunkExclusions(
      [item('a', [1, 2]), item('b', [3]), item('c', [4])],
      4,
    )
    expect(chunks).toEqual([
      [item('a', [1, 2]), item('b', [3]), item('c', [4])],
    ])
  })

  it('starts a new chunk exactly at the cap', () => {
    const chunks = chunkExclusions(
      [item('a', [1, 2]), item('b', [3, 4]), item('c', [5])],
      4,
    )
    expect(chunks).toEqual([
      [item('a', [1, 2]), item('b', [3, 4])],
      [item('c', [5])],
    ])
  })

  it('splits an item across chunks by user when it straddles the cap', () => {
    const chunks = chunkExclusions(
      [item('a', [1, 2, 3]), item('b', [4, 5, 6])],
      4,
    )
    expect(chunks).toEqual([
      [item('a', [1, 2, 3]), item('b', [4])],
      [item('b', [5, 6])],
    ])
  })

  it('splits one item with more users than the cap', () => {
    const chunks = chunkExclusions([item('a', [1, 2, 3, 4, 5])], 2)
    expect(chunks).toEqual([
      [item('a', [1, 2])],
      [item('a', [3, 4])],
      [item('a', [5])],
    ])
  })

  it('returns no chunks for no items', () => {
    expect(chunkExclusions([], 4)).toEqual([])
  })
})

describe('chunkIds', () => {
  it('splits ids at the cap', () => {
    expect(chunkIds([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunkIds([1, 2], 2)).toEqual([[1, 2]])
  })
})

describe('mergeOutcomes', () => {
  it('sums totals and dedupes failures across chunks', () => {
    expect(
      mergeOutcomes([
        { total: 2, failed: ['a'], errors: ['a: gone'] },
        { total: 1, failed: ['a', 'b'], errors: ['b: gone'] },
      ]),
    ).toEqual({ total: 3, failed: ['a', 'b'], errors: ['a: gone', 'b: gone'] })
  })
})

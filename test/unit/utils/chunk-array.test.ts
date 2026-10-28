import { chunkArray } from '@utils/chunk-array.js'
import { describe, expect, it } from 'vitest'

describe('chunkArray', () => {
  it('splits an exact multiple into equal chunks', () => {
    expect(chunkArray([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ])
  })

  it('puts the remainder in a final shorter chunk', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('returns an empty array for an empty input', () => {
    expect(chunkArray([], 3)).toEqual([])
  })

  it('returns one chunk when size exceeds the array length', () => {
    expect(chunkArray([1, 2], 10)).toEqual([[1, 2]])
  })
})

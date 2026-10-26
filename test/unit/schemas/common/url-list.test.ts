import { splitUrlList } from '@root/schemas/common/url-list.js'
import { describe, expect, it } from 'vitest'

describe('splitUrlList', () => {
  it('returns no entries for empty input', () => {
    expect(splitUrlList('')).toEqual([])
    expect(splitUrlList(null)).toEqual([])
    expect(splitUrlList(undefined)).toEqual([])
  })

  it('trims entries, drops blanks and keeps duplicates', () => {
    expect(splitUrlList(' a://1 ,, b://2 , a://1 ')).toEqual([
      'a://1',
      'b://2',
      'a://1',
    ])
  })
})

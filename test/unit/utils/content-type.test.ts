import { toContentType } from '@utils/content-type.js'
import { describe, expect, it } from 'vitest'

describe('toContentType', () => {
  it('maps show in any case to show and everything else to movie', () => {
    expect(toContentType('show')).toBe('show')
    expect(toContentType('SHOW')).toBe('show')
    expect(toContentType('movie')).toBe('movie')
    expect(toContentType('episode')).toBe('movie')
    expect(toContentType(null)).toBe('movie')
    expect(toContentType(undefined)).toBe('movie')
  })
})

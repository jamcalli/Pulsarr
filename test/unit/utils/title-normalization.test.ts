import { normalizeTitle } from '@utils/title-normalization.js'
import { describe, expect, it } from 'vitest'

describe('normalizeTitle', () => {
  it('ignores case, punctuation and spacing', () => {
    expect(normalizeTitle("Grey's Anatomy")).toBe(
      normalizeTitle('greys anatomy'),
    )
    expect(normalizeTitle('Mr. Robot')).toBe(normalizeTitle('Mr Robot'))
  })

  it('ignores accents', () => {
    expect(normalizeTitle('Pokémon')).toBe(normalizeTitle('Pokemon'))
  })

  it('ignores a trailing year', () => {
    expect(normalizeTitle('Stella (2023)')).toBe(normalizeTitle('Stella'))
  })

  it('keeps a year that is part of the title', () => {
    expect(normalizeTitle('1923')).toBe('1923')
  })

  it('keeps non-latin titles distinct', () => {
    expect(normalizeTitle('進撃の巨人')).not.toBe(normalizeTitle('巨人'))
  })
})

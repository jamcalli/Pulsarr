import { recipientLabel } from '@utils/recipient-label.js'
import { describe, expect, it } from 'vitest'

describe('recipientLabel', () => {
  it('appends the alias in parentheses', () => {
    expect(recipientLabel({ name: 'jay', alias: 'Jayman' })).toBe(
      'jay (Jayman)',
    )
  })

  it('returns the name alone without an alias', () => {
    expect(recipientLabel({ name: 'jay', alias: null })).toBe('jay')
    expect(recipientLabel({ name: 'jay' })).toBe('jay')
  })
})

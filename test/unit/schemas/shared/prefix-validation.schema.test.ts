import {
  TAG_PREFIX_DEFAULTS,
  TagPrefixSchema,
} from '@root/schemas/shared/prefix-validation.schema.js'
import { describe, expect, it } from 'vitest'

describe('TagPrefixSchema', () => {
  it.each(Object.values(TAG_PREFIX_DEFAULTS))(
    'accepts the default %s',
    (prefix) => {
      expect(TagPrefixSchema.safeParse(prefix).success).toBe(true)
    },
  )

  it('accepts mixed case and digits with hyphens', () => {
    expect(TagPrefixSchema.safeParse('Pulsarr-User2').success).toBe(true)
  })

  it.each(['pulsarr:user', 'pulsarr_user', 'pulsarr.user', 'pulsarr user', ''])(
    'rejects %j',
    (prefix) => {
      expect(TagPrefixSchema.safeParse(prefix).success).toBe(false)
    },
  )

  it('trims surrounding whitespace', () => {
    expect(TagPrefixSchema.parse('  pulsarr-user  ')).toBe('pulsarr-user')
  })
})

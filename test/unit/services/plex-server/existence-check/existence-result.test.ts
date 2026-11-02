import { combineExistence } from '@services/plex-server/existence-check/existence-result.js'
import { describe, expect, it } from 'vitest'

describe('combineExistence', () => {
  it.each([
    ['found', [], 'found'],
    ['missing', ['found'], 'found'],
    ['failed', ['found'], 'found'],
    [null, ['found'], 'found'],
    ['missing', [], 'missing'],
    ['missing', ['failed', 'missing'], 'missing'],
    ['failed', ['missing'], 'unknown'],
    [null, ['missing'], 'unknown'],
  ] as const)('owner %s with shared %j is %s', (owner, shared, expected) => {
    expect(combineExistence(owner, [...shared])).toBe(expected)
  })
})

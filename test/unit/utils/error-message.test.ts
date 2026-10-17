import { errorMessage, toError } from '@utils/error-message.js'
import { describe, expect, it } from 'vitest'

describe('errorMessage', () => {
  it('returns the message of an Error and stringifies anything else', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
    expect(errorMessage('plain')).toBe('plain')
    expect(errorMessage(42)).toBe('42')
  })
})

describe('toError', () => {
  it('returns the same Error instance', () => {
    const error = new Error('boom')
    expect(toError(error)).toBe(error)
  })

  it('wraps a non-Error in an Error with its string form', () => {
    const wrapped = toError('plain')
    expect(wrapped).toBeInstanceOf(Error)
    expect(wrapped.message).toBe('plain')
  })
})

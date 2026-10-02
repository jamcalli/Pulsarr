import { apiErrorMessage, mutationErrorMessage } from '@/lib/tanstackApi'

describe('apiErrorMessage', () => {
  it('returns the message of an Error instance', () => {
    expect(apiErrorMessage(new Error('boom'))).toBe('boom')
  })

  it('returns the message of an API error body', () => {
    expect(apiErrorMessage({ statusCode: 400, message: 'Bad input' })).toBe(
      'Bad input',
    )
  })

  it('returns null for values without a string message', () => {
    expect(apiErrorMessage({ statusCode: 500 })).toBeNull()
    expect(apiErrorMessage({ message: 42 })).toBeNull()
    expect(apiErrorMessage(null)).toBeNull()
    expect(apiErrorMessage('oops')).toBeNull()
  })
})

describe('mutationErrorMessage', () => {
  it('hides the raw message of a thrown network error', () => {
    expect(
      mutationErrorMessage(new TypeError('Failed to fetch'), 'Fallback'),
    ).toBe('An unexpected error occurred. Please try again.')
  })

  it('returns the message of an API error body', () => {
    expect(
      mutationErrorMessage(
        {
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid credentials',
        },
        'Fallback',
      ),
    ).toBe('Invalid credentials')
  })

  it('returns the fallback for an error body without a message', () => {
    expect(mutationErrorMessage({ statusCode: 500 }, 'Fallback')).toBe(
      'Fallback',
    )
  })
})

import { QUERY_RETRY_LIMIT } from '@/lib/constants'
import {
  apiErrorMessage,
  firstLoadError,
  loadErrorMessage,
  mutationErrorMessage,
  shouldRetryQuery,
} from '@/lib/tanstackApi'

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

  it('returns null for a blank message so fallbacks apply', () => {
    expect(apiErrorMessage(new Error(''))).toBeNull()
    expect(apiErrorMessage({ statusCode: 500, message: '   ' })).toBeNull()
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

describe('loadErrorMessage', () => {
  it('returns null while loading', () => {
    expect(
      loadErrorMessage(
        { data: undefined, isError: false, error: null },
        'Fallback',
      ),
    ).toBeNull()
  })

  it('returns the error message when the load failed with no data', () => {
    expect(
      loadErrorMessage(
        { data: undefined, isError: true, error: { message: 'Down' } },
        'Fallback',
      ),
    ).toBe('Down')
  })

  it('returns the fallback when the error message is blank', () => {
    expect(
      loadErrorMessage(
        { data: undefined, isError: true, error: { message: ' ' } },
        'Fallback',
      ),
    ).toBe('Fallback')
  })

  it('returns null when a refetch failed over cached data', () => {
    expect(
      loadErrorMessage(
        { data: { items: [] }, isError: true, error: { message: 'Down' } },
        'Fallback',
      ),
    ).toBeNull()
  })
})

describe('firstLoadError', () => {
  it('returns the message of the first query that failed with no data', () => {
    expect(
      firstLoadError(
        [
          { data: { items: [] }, isError: true, error: { message: 'Stale' } },
          { data: undefined, isError: true, error: { message: 'First' } },
          { data: undefined, isError: true, error: { message: 'Second' } },
        ],
        'Fallback',
      ),
    ).toBe('First')
  })

  it('returns null when every query has data', () => {
    expect(
      firstLoadError(
        [
          { data: { items: [] }, isError: false, error: null },
          { data: { items: [] }, isError: true, error: { message: 'Down' } },
        ],
        'Fallback',
      ),
    ).toBeNull()
  })
})

describe('shouldRetryQuery', () => {
  const serverError = {
    statusCode: 500,
    error: 'Internal Server Error',
    message: 'Down',
  }

  it('retries a network failure', () => {
    expect(shouldRetryQuery(0, new TypeError('Failed to fetch'))).toBe(true)
  })

  it('retries a server error', () => {
    expect(shouldRetryQuery(0, serverError)).toBe(true)
    expect(shouldRetryQuery(0, { ...serverError, statusCode: 503 })).toBe(true)
  })

  it('retries a rate limit', () => {
    expect(shouldRetryQuery(0, { ...serverError, statusCode: 429 })).toBe(true)
  })

  it('does not retry a client error', () => {
    expect(shouldRetryQuery(0, { ...serverError, statusCode: 404 })).toBe(false)
    expect(shouldRetryQuery(0, { ...serverError, statusCode: 400 })).toBe(false)
  })

  it('stops at the retry limit', () => {
    expect(shouldRetryQuery(QUERY_RETRY_LIMIT - 1, serverError)).toBe(true)
    expect(shouldRetryQuery(QUERY_RETRY_LIMIT, serverError)).toBe(false)
  })
})

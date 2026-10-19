import {
  apiErrorMessage,
  firstLoadError,
  loadErrorMessage,
  mutationErrorMessage,
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

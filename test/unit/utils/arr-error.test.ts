import { HttpError } from '@root/types/arr-connection.types.js'
import {
  isWebhookCallbackFailure,
  parseArrErrorMessage,
  parseArrValidationFailures,
} from '@utils/arr-error.js'
import { describe, expect, it } from 'vitest'

describe('arr-error', () => {
  describe('parseArrErrorMessage', () => {
    describe('array format (validation errors)', () => {
      it('should extract error message from webhook callback error', () => {
        const errorData = [
          {
            propertyName: 'Url',
            errorMessage:
              'Unable to send test message: Unable to post to webhook: Connection refused',
            attemptedValue: 'http://unreachable:3003/webhook',
            severity: 'Error',
            errorCode: 'PropertyValidator',
          },
        ]

        const result = parseArrErrorMessage(errorData)

        expect(result).toBe(
          'Unable to send test message: Unable to post to webhook: Connection refused',
        )
      })

      it('should extract error messages with various network error messages', () => {
        const testCases = [
          'Unable to send test message: Connection timeout',
          'Unable to send test message: No route to host',
          'Unable to send test message: Name or service not known',
        ]

        for (const errorMessage of testCases) {
          const errorData = [
            {
              propertyName: 'Url',
              errorMessage,
            },
          ]

          const result = parseArrErrorMessage(errorData)

          expect(result).toBe(errorMessage)
        }
      })

      it('should extract message regardless of propertyName', () => {
        const errorData = [
          {
            propertyName: 'ApiKey',
            errorMessage: 'Unable to send test message: Invalid API key',
          },
        ]

        const result = parseArrErrorMessage(errorData)

        expect(result).toBe('Unable to send test message: Invalid API key')
      })

      it('should join multiple error messages with semicolons', () => {
        const errorData = [
          {
            propertyName: 'Name',
            errorMessage: 'Name is required',
          },
          {
            propertyName: 'ApiKey',
            errorMessage: 'API key is invalid',
          },
        ]

        const result = parseArrErrorMessage(errorData)

        expect(result).toBe('Name is required; API key is invalid')
      })

      it('should filter out empty error messages when joining', () => {
        const errorData = [
          {
            propertyName: 'Name',
            errorMessage: 'Name is required',
          },
          {
            propertyName: 'Other',
            errorMessage: '',
          },
          {
            propertyName: 'ApiKey',
            errorMessage: 'API key is invalid',
          },
        ]

        const result = parseArrErrorMessage(errorData)

        expect(result).toBe('Name is required; API key is invalid')
      })

      it('should return default message for empty array', () => {
        const errorData: unknown[] = []

        const result = parseArrErrorMessage(errorData)

        expect(result).toBe('Validation error')
      })

      it('should return default message when all error messages are empty', () => {
        const errorData = [
          { propertyName: 'Field1', errorMessage: '' },
          { propertyName: 'Field2', errorMessage: undefined },
        ]

        const result = parseArrErrorMessage(errorData)

        expect(result).toBe('Validation error')
      })

      it('should join all errors including webhook errors', () => {
        const errorData = [
          {
            propertyName: 'Name',
            errorMessage: 'Name is required',
          },
          {
            propertyName: 'Url',
            errorMessage: 'Unable to send test message: Connection refused',
          },
        ]

        const result = parseArrErrorMessage(errorData)

        expect(result).toBe(
          'Name is required; Unable to send test message: Connection refused',
        )
      })
    })

    describe('object format ({ message })', () => {
      it('should extract message from object with message property', () => {
        const errorData = {
          message: 'Internal server error',
        }

        const result = parseArrErrorMessage(errorData)

        expect(result).toBe('Internal server error')
      })

      it('should convert non-string message to string', () => {
        const errorData = {
          message: 12345,
        }

        const result = parseArrErrorMessage(errorData)

        expect(result).toBe('12345')
      })

      it('should handle object with additional properties', () => {
        const errorData = {
          message: 'Error occurred',
          code: 'ERR_INTERNAL',
          details: { foo: 'bar' },
        }

        const result = parseArrErrorMessage(errorData)

        expect(result).toBe('Error occurred')
      })
    })

    describe('edge cases', () => {
      it('should return empty message for null', () => {
        const result = parseArrErrorMessage(null)

        expect(result).toBe('')
      })

      it('should return empty message for undefined', () => {
        const result = parseArrErrorMessage(undefined)

        expect(result).toBe('')
      })

      it('should return empty message for string', () => {
        const result = parseArrErrorMessage('plain string error')

        expect(result).toBe('')
      })

      it('should return empty message for number', () => {
        const result = parseArrErrorMessage(500)

        expect(result).toBe('')
      })

      it('should return empty message for object without message property', () => {
        const errorData = {
          error: 'Something went wrong',
          code: 'ERR_UNKNOWN',
        }

        const result = parseArrErrorMessage(errorData)

        expect(result).toBe('')
      })

      it('should handle array with missing errorMessage properties', () => {
        const errorData = [
          { propertyName: 'Field1' },
          { propertyName: 'Field2', errorMessage: 'Valid message' },
        ]

        const result = parseArrErrorMessage(errorData)

        expect(result).toBe('Valid message')
      })
    })

    describe('real-world Radarr/Sonarr responses', () => {
      it('should parse actual Radarr webhook validation error', () => {
        // Actual format from Radarr/Sonarr NzbDrone core
        const errorData = [
          {
            propertyName: 'Url',
            errorMessage:
              'Unable to send test message: Unable to post to webhook: The underlying connection was closed',
            attemptedValue: 'http://pulsarr:3003/v1/notifications/webhook',
            customState: null,
            severity: 'Error',
            errorCode: 'PropertyValidator',
            formattedMessagePlaceholderValues: null,
          },
        ]

        const result = parseArrErrorMessage(errorData)

        expect(result).toContain('Unable to send test message')
      })

      it('should parse Radarr URL format validation error', () => {
        const errorData = [
          {
            propertyName: 'Url',
            errorMessage: "Invalid Url: 'not a valid url'",
            attemptedValue: 'not a valid url',
            severity: 'Error',
          },
        ]

        const result = parseArrErrorMessage(errorData)

        expect(result).toBe("Invalid Url: 'not a valid url'")
      })

      it('should parse Radarr conflict error (tag already exists)', () => {
        const errorData = {
          message: 'Tag with this label already exists',
        }

        const result = parseArrErrorMessage(errorData)

        expect(result).toBe('Tag with this label already exists')
      })
    })
  })

  describe('parseArrValidationFailures', () => {
    it('returns the failures from an array body', () => {
      const failures = [{ propertyName: 'Url', errorMessage: 'refused' }]

      expect(parseArrValidationFailures(failures)).toEqual(failures)
    })

    it('returns an empty list for a message object', () => {
      expect(parseArrValidationFailures({ message: 'refused' })).toEqual([])
    })

    it('returns an empty list for null', () => {
      expect(parseArrValidationFailures(null)).toEqual([])
    })

    it('drops items that are not objects and non-string fields', () => {
      expect(
        parseArrValidationFailures([
          'refused',
          null,
          { propertyName: 'Url', errorMessage: 42, severity: 'Error' },
        ]),
      ).toEqual([{ propertyName: 'Url', severity: 'Error' }])
    })
  })

  describe('isWebhookCallbackFailure', () => {
    it('is true for a 500 with any body', () => {
      expect(isWebhookCallbackFailure(new HttpError('refused', 500))).toBe(true)
    })

    it('is true for a 400 with a Url failure', () => {
      const error = new HttpError('unable to post', 400, [
        { propertyName: 'Url', errorMessage: 'Unable to send test message' },
      ])

      expect(isWebhookCallbackFailure(error)).toBe(true)
    })

    it('is false for a 400 with a Name failure', () => {
      const error = new HttpError('not unique', 400, [
        { propertyName: 'Name', errorMessage: 'Should be unique' },
      ])

      expect(isWebhookCallbackFailure(error)).toBe(false)
    })

    it('is false for a 400 with no failures', () => {
      expect(isWebhookCallbackFailure(new HttpError('bad', 400, []))).toBe(
        false,
      )
    })

    it('is false for a 401', () => {
      expect(
        isWebhookCallbackFailure(new HttpError('Authentication failed', 401)),
      ).toBe(false)
    })
  })
})

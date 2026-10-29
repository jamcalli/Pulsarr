import {
  isTrustedRequestOrigin,
  parseAllowedOrigins,
  type RequestOriginFacts,
} from '@utils/request-origin.js'
import { describe, expect, it } from 'vitest'

const facts = (overrides: Partial<RequestOriginFacts>): RequestOriginFacts => ({
  method: 'POST',
  host: '192.168.1.10:3003',
  origin: 'https://other.example.com',
  secFetchSite: undefined,
  hasApiKey: false,
  ...overrides,
})

describe('request-origin', () => {
  describe('parseAllowedOrigins', () => {
    it('returns an empty list for an empty value', () => {
      expect(parseAllowedOrigins('')).toEqual([])
      expect(parseAllowedOrigins(undefined)).toEqual([])
    })

    it('normalizes entries to their origin form', () => {
      expect(
        parseAllowedOrigins(
          ' https://Dash.Example.com/ , http://10.0.0.5:8080/path,https://x.example.com:443',
        ),
      ).toEqual([
        'https://dash.example.com',
        'http://10.0.0.5:8080',
        'https://x.example.com',
      ])
    })

    it.each(['dash.example.com', 'ftp://dash.example.com', 'null', '*'])(
      'rejects %s',
      (entry) => {
        expect(() => parseAllowedOrigins(entry)).toThrow(/allowedOrigins/)
      },
    )
  })

  describe('isTrustedRequestOrigin', () => {
    it.each([
      ['GET with a foreign origin', facts({ method: 'GET' })],
      ['HEAD with a foreign origin', facts({ method: 'HEAD' })],
      ['OPTIONS with a foreign origin', facts({ method: 'OPTIONS' })],
      ['an API key with a foreign origin', facts({ hasApiKey: true })],
      ['no origin header', facts({ origin: undefined })],
      [
        'sec-fetch-site same-origin with a different host',
        facts({ secFetchSite: 'same-origin' }),
      ],
      [
        'an origin matching the host',
        facts({ origin: 'http://192.168.1.10:3003' }),
      ],
      [
        'an origin matching the host with a different scheme',
        facts({ origin: 'https://192.168.1.10:3003' }),
      ],
      [
        'a host header with an explicit default port',
        facts({
          origin: 'https://pulsarr.example.com',
          host: 'pulsarr.example.com:443',
        }),
      ],
      [
        'a host header in a different case',
        facts({
          origin: 'https://pulsarr.example.com',
          host: 'Pulsarr.Example.com',
        }),
      ],
      [
        'an IPv6 host',
        facts({ origin: 'http://[::1]:3003', host: '[::1]:3003' }),
      ],
    ])('passes %s', (_label, input) => {
      expect(isTrustedRequestOrigin(input, [])).toBe(true)
    })

    it('passes a listed origin', () => {
      expect(
        isTrustedRequestOrigin(facts({}), ['https://other.example.com']),
      ).toBe(true)
    })

    it.each([
      ['a foreign origin', facts({})],
      ['a null origin', facts({ origin: 'null' })],
      ['sec-fetch-site cross-site', facts({ secFetchSite: 'cross-site' })],
      ['sec-fetch-site same-site', facts({ secFetchSite: 'same-site' })],
      [
        'an origin on the same hostname but another port',
        facts({ origin: 'http://192.168.1.10:8080' }),
      ],
      [
        'an empty host',
        facts({ origin: 'http://192.168.1.10:3003', host: '' }),
      ],
      ['DELETE with a foreign origin', facts({ method: 'DELETE' })],
    ])('rejects %s', (_label, input) => {
      expect(
        isTrustedRequestOrigin(input, ['https://listed.example.com']),
      ).toBe(false)
    })
  })
})

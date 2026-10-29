import { hostname } from 'node:os'
import {
  buildAllowedHostSet,
  isAllowedHost,
  parseAllowedHosts,
} from '@utils/allowed-hosts.js'
import { describe, expect, it } from 'vitest'

describe('allowed-hosts', () => {
  describe('parseAllowedHosts', () => {
    it('returns an empty list for an empty value', () => {
      expect(parseAllowedHosts('')).toEqual([])
      expect(parseAllowedHosts(undefined)).toEqual([])
    })

    it('lowercases and trims entries', () => {
      expect(
        parseAllowedHosts(' Pulsarr.Example.com, 192.168.1.10 ,fd00::5'),
      ).toEqual(['pulsarr.example.com', '192.168.1.10', 'fd00::5'])
    })

    it.each([
      ['[fd00::5]', 'fd00::5'],
      ['FD00:0:0::5', 'fd00::5'],
      ['::ffff:192.168.1.5', '192.168.1.5'],
    ])('normalizes the IPv6 entry %s', (entry, expected) => {
      expect(parseAllowedHosts(entry)).toEqual([expected])
    })

    it.each([
      'https://pulsarr.example.com',
      'pulsarr.example.com:3003',
      'pulsarr.example.com/app',
      '192.168.1',
    ])('rejects %s', (entry) => {
      expect(() => parseAllowedHosts(entry)).toThrow(/allowedHosts/)
    })
  })

  describe('isAllowedHost', () => {
    it('matches a bracketed IPv6 entry against the request host', () => {
      const bracketed = buildAllowedHostSet(parseAllowedHosts('[fd00::5]'))

      expect(isAllowedHost('[fd00::5]', bracketed)).toBe(true)
    })

    const allowed = buildAllowedHostSet(['pulsarr.example.com', 'fd00::5'])

    it.each([
      'pulsarr.example.com',
      'PULSARR.example.com',
      'localhost',
      '127.0.0.1',
      '[::1]',
      '[fd00::5]',
      '[FD00:0:0::5]',
      hostname(),
      '',
    ])('accepts %j', (host) => {
      expect(isAllowedHost(host, allowed)).toBe(true)
    })

    it.each(['other.example.com', '192.168.1.10', 'example.com'])(
      'rejects %s',
      (host) => {
        expect(isAllowedHost(host, allowed)).toBe(false)
      },
    )
  })
})

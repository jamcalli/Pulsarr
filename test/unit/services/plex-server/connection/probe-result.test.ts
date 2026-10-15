import {
  classifyProbeError,
  connectionTestResult,
  httpFailureOutcome,
  plexMachineId,
} from '@services/plex-server/connection/probe-result.js'
import { describe, expect, it } from 'vitest'

function bunError(code: string) {
  return Object.assign(new TypeError(code), { code })
}

function nodeError(code: string) {
  return new TypeError('fetch failed', {
    cause: Object.assign(new Error(code), { code }),
  })
}

describe('classifyProbeError', () => {
  it.each([
    ['ENOTFOUND', 'unreachable'],
    ['EAI_AGAIN', 'unreachable'],
    ['ECONNREFUSED', 'unreachable'],
    ['EHOSTUNREACH', 'unreachable'],
    ['ENETUNREACH', 'unreachable'],
    ['ECONNRESET', 'unreachable'],
    ['DEPTH_ZERO_SELF_SIGNED_CERT', 'certificate'],
    ['CERT_HAS_EXPIRED', 'certificate'],
    ['ERR_TLS_CERT_ALTNAME_INVALID', 'certificate'],
    ['ETIMEDOUT', 'unreachable'],
  ])('maps %s to %s from either runtime', (code, failure) => {
    expect(classifyProbeError(bunError(code))).toBe(failure)
    expect(classifyProbeError(nodeError(code))).toBe(failure)
  })

  it('reads an aborted or timed out request as unreachable', () => {
    expect(
      classifyProbeError(new DOMException('timed out', 'TimeoutError')),
    ).toBe('unreachable')
    expect(classifyProbeError(new DOMException('aborted', 'AbortError'))).toBe(
      'unreachable',
    )
  })

  it('reads an unknown error as unreachable', () => {
    expect(classifyProbeError(new TypeError('Failed to fetch'))).toBe(
      'unreachable',
    )
    expect(classifyProbeError(bunError('SOMETHING_NEW'))).toBe('unreachable')
    expect(classifyProbeError('not an error')).toBe('unreachable')
  })
})

describe('httpFailureOutcome', () => {
  it.each([401, 403])('reads %i as a rejected token', (status) => {
    expect(httpFailureOutcome(status)).toEqual({
      ok: false,
      reason: 'auth',
      status,
    })
  })

  it('reads any other status as something other than Plex', () => {
    expect(httpFailureOutcome(500)).toEqual({
      ok: false,
      reason: 'invalid',
      status: 500,
    })
  })
})

describe('connectionTestResult', () => {
  it('passes a working connection with no code', () => {
    expect(connectionTestResult({ ok: true, elapsedMs: 12 })).toEqual({
      success: true,
      message: 'Connected to the Plex server.',
    })
  })

  it('explains a failure in its own words', () => {
    expect(
      connectionTestResult({ ok: false, reason: 'certificate', status: null }),
    ).toEqual({
      success: false,
      message: "The server's certificate doesn't match this address.",
    })
  })
})

describe('plexMachineId', () => {
  it('reads the server id from a MediaContainer', () => {
    expect(
      plexMachineId({ MediaContainer: { machineIdentifier: 'abc' } }),
    ).toBe('abc')
  })

  it.each([
    null,
    {},
    { MediaContainer: {} },
    { MediaContainer: { machineIdentifier: 1 } },
  ])('rejects %j', (body) => {
    expect(plexMachineId(body)).toBeNull()
  })
})

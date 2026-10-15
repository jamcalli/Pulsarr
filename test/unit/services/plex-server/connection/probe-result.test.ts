import {
  classifyProbeError,
  httpFailureOutcome,
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
    ['ENOTFOUND', 'dns'],
    ['EAI_AGAIN', 'dns'],
    ['ECONNREFUSED', 'refused'],
    ['EHOSTUNREACH', 'unreachable'],
    ['ENETUNREACH', 'unreachable'],
    ['ECONNRESET', 'reset'],
    ['DEPTH_ZERO_SELF_SIGNED_CERT', 'tls'],
    ['CERT_HAS_EXPIRED', 'tls'],
    ['ERR_TLS_CERT_ALTNAME_INVALID', 'tls'],
    ['ETIMEDOUT', 'timeout'],
  ])('maps %s to %s from either runtime', (code, failure) => {
    expect(classifyProbeError(bunError(code))).toBe(failure)
    expect(classifyProbeError(nodeError(code))).toBe(failure)
  })

  it('reads an aborted or timed out request as a timeout', () => {
    expect(
      classifyProbeError(new DOMException('timed out', 'TimeoutError')),
    ).toBe('timeout')
    expect(classifyProbeError(new DOMException('aborted', 'AbortError'))).toBe(
      'timeout',
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
    expect(httpFailureOutcome(status).failure).toBe('unauthorized')
  })

  it('reads any other status as an http failure', () => {
    expect(httpFailureOutcome(500)).toMatchObject({
      failure: 'http',
      httpStatus: 500,
    })
  })
})

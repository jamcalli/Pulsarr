import type { ProbeOutcome } from '@services/plex-server/connection/probe-result.js'
import { rankProbedConnections } from '@services/plex-server/connection/ranking.js'
import { describe, expect, it } from 'vitest'

function probed(uri: string, local: boolean, outcome: ProbeOutcome) {
  return { connection: { uri, local }, outcome }
}

const up = (latencyMs: number): ProbeOutcome => ({
  reachable: true,
  latencyMs,
  failure: null,
  httpStatus: null,
})
const down: ProbeOutcome = {
  reachable: false,
  latencyMs: null,
  failure: 'timeout',
  httpStatus: null,
}

const order = (list: ReturnType<typeof probed>[]) =>
  rankProbedConnections(list).map(({ connection }) => connection.uri)

describe('rankProbedConnections', () => {
  it('puts reachable connections first', () => {
    expect(
      order([
        probed('https://a', true, down),
        probed('http://b', false, up(90)),
      ]),
    ).toEqual(['http://b', 'https://a'])
  })

  it('prefers https, then local, then lowest latency', () => {
    expect(
      order([
        probed('http://local', true, up(1)),
        probed('https://remote-slow', false, up(80)),
        probed('https://local', true, up(40)),
        probed('https://remote-fast', false, up(20)),
      ]),
    ).toEqual([
      'https://local',
      'https://remote-fast',
      'https://remote-slow',
      'http://local',
    ])
  })

  it('still orders the list when every probe fails', () => {
    expect(
      order([
        probed('http://local', true, down),
        probed('https://remote', false, down),
        probed('https://local', true, down),
      ]),
    ).toEqual(['https://local', 'https://remote', 'http://local'])
  })

  it('leaves its input untouched', () => {
    const input = [
      probed('http://b', false, up(9)),
      probed('https://a', true, up(1)),
    ]
    rankProbedConnections(input)
    expect(input.map(({ connection }) => connection.uri)).toEqual([
      'http://b',
      'https://a',
    ])
  })
})

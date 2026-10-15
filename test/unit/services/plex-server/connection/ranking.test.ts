import type { ProbeOutcome } from '@services/plex-server/connection/probe-result.js'
import { rankProbedConnections } from '@services/plex-server/connection/ranking.js'
import { describe, expect, it } from 'vitest'

function probed(uri: string, local: boolean, outcome: ProbeOutcome) {
  return { connection: { uri, local }, outcome }
}

const up = (elapsedMs: number): ProbeOutcome => ({ ok: true, elapsedMs })
const down: ProbeOutcome = { ok: false, code: 'unreachable', status: null }

const order = (list: ReturnType<typeof probed>[]) =>
  rankProbedConnections(list).map(({ connection }) => connection.uri)

describe('rankProbedConnections', () => {
  it('puts working connections first', () => {
    expect(
      order([
        probed('https://a', true, down),
        probed('http://b', false, up(90)),
      ]),
    ).toEqual(['http://b', 'https://a'])
  })

  it('prefers local, then https, then fastest', () => {
    expect(
      order([
        probed('http://local', true, up(1)),
        probed('https://remote-slow', false, up(80)),
        probed('https://local', true, up(40)),
        probed('https://remote-fast', false, up(20)),
      ]),
    ).toEqual([
      'https://local',
      'http://local',
      'https://remote-fast',
      'https://remote-slow',
    ])
  })

  it('still orders the list when every probe fails', () => {
    expect(
      order([
        probed('http://local', true, down),
        probed('https://remote', false, down),
        probed('https://local', true, down),
      ]),
    ).toEqual(['https://local', 'http://local', 'https://remote'])
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

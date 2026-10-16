import { flattenLogData } from '@/features/system/lib/logs/log-fields'
import { setFormatLocale } from '@/lib/format'
import { authRequired, configError } from '../../../../log-fixtures.js'

describe('flattenLogData', () => {
  beforeEach(() => setFormatLocale('en-US'))
  afterEach(() => setFormatLocale(undefined))

  it('flattens one level into dotted keys with values as logged', () => {
    const { fields, blocks } = flattenLogData(authRequired.data ?? {})
    expect(fields).toEqual([
      { key: 'reqId', value: 'req-141' },
      { key: 'err.message', value: 'Plex did not accept the token' },
      { key: 'err.name', value: 'UnauthorizedError' },
      { key: 'err.status', value: '401' },
      { key: 'request.id', value: 'req-141' },
      { key: 'request.method', value: 'GET' },
      { key: 'request.path', value: '/v1/plex/ping' },
    ])
    expect(blocks).toEqual([])
  })

  it('gives a multi-line value its own block', () => {
    const { fields, blocks } = flattenLogData(configError.data ?? {})
    expect(fields).toEqual([
      { key: 'err.name', value: 'SQLiteError' },
      { key: 'err.errno', value: '1' },
    ])
    expect(blocks).toEqual([
      {
        key: 'err.stack',
        value:
          'SQLiteError: no such column: maintainerrWebhookSecret\n    at prepare (bun:sqlite:345:37)',
      },
    ])
  })

  it('lists plain arrays and writes the rest as JSON', () => {
    const { fields, blocks } = flattenLogData({
      guids: ['tvdb:1', 'tvdb:2'],
      to: [100000003],
      mixed: [{ id: 1 }],
      none: null,
      empty: {},
      nested: { added: { shows: 0, movies: 2 } },
    })
    expect(fields).toEqual([
      { key: 'guids', value: 'tvdb:1, tvdb:2' },
      { key: 'to', value: '100000003' },
      { key: 'mixed', value: '[{"id":1}]' },
      { key: 'none', value: 'null' },
      { key: 'empty', value: '{}' },
    ])
    expect(blocks).toEqual([
      {
        key: 'nested.added',
        value: JSON.stringify({ shows: 0, movies: 2 }, null, 2),
      },
    ])
  })
})

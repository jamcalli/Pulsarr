import { ARR_API_KEY_PLACEHOLDER } from '@root/schemas/common/arr-placeholder'
import {
  configuredIds,
  refreshRows,
  setUpNames,
} from '@/features/system/lib/plex-connection/library-refresh'

const results = {
  radarr: [
    { id: 1, name: 'Radarr', success: true, message: 'ok' },
    {
      id: 2,
      name: 'Radarr 4K',
      success: false,
      message: 'connect ECONNREFUSED',
    },
    { id: 9, name: 'Default Radarr Instance', success: false, message: 'x' },
  ],
  sonarr: [{ id: 1, name: 'Sonarr', success: true, message: 'ok' }],
}
const configured = { radarr: new Set([1, 2]), sonarr: new Set([1]) }

describe('library refresh rows', () => {
  it('keeps only configured instances', () => {
    expect(
      configuredIds([
        { id: 1, apiKey: 'real' },
        { id: 9, apiKey: ARR_API_KEY_PLACEHOLDER },
      ]),
    ).toEqual(new Set([1]))
  })

  it('reads status as set up or not, without messages', () => {
    const rows = refreshRows(results, 'status', configured)
    expect(rows.map((row) => [row.name, row.state, row.message])).toEqual([
      ['Radarr', 'set', null],
      ['Radarr 4K', 'unset', null],
      ['Sonarr', 'set', null],
    ])
  })

  it('reads a setup run as set up or failed with the reason', () => {
    const rows = refreshRows(results, 'setup', configured)
    expect(rows.map((row) => [row.name, row.state, row.message])).toEqual([
      ['Radarr', 'set', null],
      ['Radarr 4K', 'failed', 'connect ECONNREFUSED'],
      ['Sonarr', 'set', null],
    ])
  })

  it('reads a remove run as not set up', () => {
    const rows = refreshRows(results, 'remove', configured)
    expect(rows.map((row) => row.state)).toEqual(['unset', 'failed', 'unset'])
  })

  it('names the instances that have it', () => {
    expect(setUpNames(refreshRows(results, 'status', configured))).toEqual([
      'Radarr',
      'Sonarr',
    ])
  })
})

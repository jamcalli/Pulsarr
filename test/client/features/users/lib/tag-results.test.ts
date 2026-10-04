import {
  cleanupResultRows,
  createResultRows,
  removeResultRows,
  syncResultRows,
} from '@/features/users/lib/tag-results'

describe('createResultRows', () => {
  it('lists created, skipped, instances and failed per target', () => {
    expect(
      createResultRows({
        success: true,
        message: 'done',
        mode: 'create',
        sonarr: { created: 3, skipped: 1, failed: 0, instances: 2 },
        radarr: { created: 0, skipped: 4, failed: 0, instances: 1 },
      }),
    ).toEqual([
      {
        target: 'Sonarr',
        stats: [
          { label: 'Created', value: 3 },
          { label: 'Skipped', value: 1 },
          { label: 'Instances', value: 2 },
          { label: 'Failed', value: 0, destructive: true },
        ],
      },
      {
        target: 'Radarr',
        stats: [
          { label: 'Created', value: 0 },
          { label: 'Skipped', value: 4 },
          { label: 'Instances', value: 1 },
          { label: 'Failed', value: 0, destructive: true },
        ],
      },
    ])
  })

  it('marks the failed stat destructive', () => {
    const [sonarr] = createResultRows({
      success: false,
      message: 'partial',
      mode: 'create',
      sonarr: { created: 1, skipped: 0, failed: 2, instances: 1 },
      radarr: { created: 0, skipped: 0, failed: 0, instances: 0 },
    })
    expect(sonarr?.stats.at(-1)).toEqual({
      label: 'Failed',
      value: 2,
      destructive: true,
    })
  })
})

describe('syncResultRows', () => {
  it('lists tagged, skipped and failed per target', () => {
    expect(
      syncResultRows({
        success: true,
        message: 'done',
        mode: 'sync',
        sonarr: { tagged: 10, skipped: 2, failed: 0 },
        radarr: { tagged: 5, skipped: 0, failed: 1 },
      }),
    ).toEqual([
      {
        target: 'Sonarr',
        stats: [
          { label: 'Tagged', value: 10 },
          { label: 'Skipped', value: 2 },
          { label: 'Failed', value: 0, destructive: true },
        ],
      },
      {
        target: 'Radarr',
        stats: [
          { label: 'Tagged', value: 5 },
          { label: 'Skipped', value: 0 },
          { label: 'Failed', value: 1, destructive: true },
        ],
      },
    ])
  })

  it('omits orphan columns for both targets when cleanup did not run', () => {
    const rows = syncResultRows({
      success: true,
      message: 'done',
      mode: 'sync',
      sonarr: { tagged: 1, skipped: 0, failed: 0 },
      radarr: { tagged: 1, skipped: 0, failed: 0 },
    })
    for (const row of rows) {
      expect(row.stats.map((stat) => stat.label)).toEqual([
        'Tagged',
        'Skipped',
        'Failed',
      ])
    }
  })

  it('appends orphan columns to both targets when cleanup ran', () => {
    const rows = syncResultRows({
      success: true,
      message: 'done',
      mode: 'sync',
      sonarr: { tagged: 1, skipped: 0, failed: 0 },
      radarr: { tagged: 1, skipped: 0, failed: 0 },
      orphanedCleanup: {
        sonarr: { removed: 2, skipped: 1, failed: 0, instances: 1 },
        radarr: { removed: 0, skipped: 0, failed: 3, instances: 1 },
      },
    })
    expect(rows[0]?.stats).toEqual([
      { label: 'Tagged', value: 1 },
      { label: 'Skipped', value: 0 },
      { label: 'Failed', value: 0, destructive: true },
      { label: 'Orphans removed', value: 2 },
      { label: 'Orphans skipped', value: 1 },
      { label: 'Orphans failed', value: 0, destructive: true },
    ])
    expect(rows[1]?.stats).toEqual([
      { label: 'Tagged', value: 1 },
      { label: 'Skipped', value: 0 },
      { label: 'Failed', value: 0, destructive: true },
      { label: 'Orphans removed', value: 0 },
      { label: 'Orphans skipped', value: 0 },
      { label: 'Orphans failed', value: 3, destructive: true },
    ])
  })
})

describe('cleanupResultRows', () => {
  it('lists removed, skipped, instances and failed per target', () => {
    expect(
      cleanupResultRows({
        success: true,
        message: 'done',
        sonarr: { removed: 2, skipped: 0, failed: 0, instances: 1 },
        radarr: { removed: 1, skipped: 1, failed: 4, instances: 2 },
      }),
    ).toEqual([
      {
        target: 'Sonarr',
        stats: [
          { label: 'Removed', value: 2 },
          { label: 'Skipped', value: 0 },
          { label: 'Instances', value: 1 },
          { label: 'Failed', value: 0, destructive: true },
        ],
      },
      {
        target: 'Radarr',
        stats: [
          { label: 'Removed', value: 1 },
          { label: 'Skipped', value: 1 },
          { label: 'Instances', value: 2 },
          { label: 'Failed', value: 4, destructive: true },
        ],
      },
    ])
  })
})

describe('removeResultRows', () => {
  it('lists items updated, tags removed, tags deleted, instances and failed', () => {
    const stats = {
      itemsProcessed: 9,
      itemsUpdated: 7,
      tagsRemoved: 12,
      tagsDeleted: 3,
      failed: 0,
      instances: 1,
    }
    const [sonarr, radarr] = removeResultRows({
      success: true,
      message: 'done',
      mode: 'remove',
      sonarr: stats,
      radarr: { ...stats, failed: 1 },
    })
    expect(sonarr).toEqual({
      target: 'Sonarr',
      stats: [
        { label: 'Items updated', value: 7 },
        { label: 'Tags removed', value: 12 },
        { label: 'Tags deleted', value: 3 },
        { label: 'Instances', value: 1 },
        { label: 'Failed', value: 0, destructive: true },
      ],
    })
    expect(radarr?.stats.at(-1)).toEqual({
      label: 'Failed',
      value: 1,
      destructive: true,
    })
  })
})

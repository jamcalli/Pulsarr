import { PLEX_LABEL_SYNC_DEFAULTS } from '@schemas/plex/label-sync-config.schema.js'
import { removeAllLabels } from '@services/plex-label-sync/cleanup/index.js'
import { PlexLabelSyncService } from '@services/plex-label-sync.service.js'
import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'

vi.mock('@services/plex-label-sync/cleanup/index.js', () => ({
  cleanupLabelsForWatchlistItems: vi.fn(),
  cleanupOrphanedPlexLabels: vi.fn(),
  removeAllLabels: vi.fn().mockResolvedValue({
    processed: 0,
    removed: 0,
    failed: 0,
  }),
  resetLabels: vi.fn(),
}))

describe('PlexLabelSyncService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes the default prefixes to every dep when the stored ones are empty', async () => {
    const fastify = {
      config: {
        plexLabelSync: {
          ...PLEX_LABEL_SYNC_DEFAULTS,
          labelPrefix: '',
          removedLabelPrefix: '',
        },
      },
      db: {},
      plexServerService: {},
    } as unknown as FastifyInstance
    const service = new PlexLabelSyncService(createMockLogger(), fastify)

    await service.removeAllLabels()

    const deps = vi.mocked(removeAllLabels).mock.calls[0][0]
    expect(deps.labelPrefix).toBe(PLEX_LABEL_SYNC_DEFAULTS.labelPrefix)
    expect(deps.removedLabelPrefix).toBe(
      PLEX_LABEL_SYNC_DEFAULTS.removedLabelPrefix,
    )
    expect(deps.config.labelPrefix).toBe(PLEX_LABEL_SYNC_DEFAULTS.labelPrefix)
    expect(deps.config.removedLabelPrefix).toBe(
      PLEX_LABEL_SYNC_DEFAULTS.removedLabelPrefix,
    )
  })
})

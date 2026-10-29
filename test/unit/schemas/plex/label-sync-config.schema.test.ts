import {
  PLEX_LABEL_SYNC_DEFAULTS,
  PlexLabelSyncConfigPayloadSchema,
} from '@root/schemas/plex/label-sync-config.schema.js'
import { describe, expect, it } from 'vitest'

describe('PlexLabelSyncConfigPayloadSchema', () => {
  it('accepts the default label prefixes', () => {
    const result = PlexLabelSyncConfigPayloadSchema.safeParse(
      PLEX_LABEL_SYNC_DEFAULTS,
    )
    expect(result.success).toBe(true)
  })

  it('accepts underscores, colons and dots in label prefixes', () => {
    const result = PlexLabelSyncConfigPayloadSchema.safeParse({
      ...PLEX_LABEL_SYNC_DEFAULTS,
      labelPrefix: 'my_app:labels.v2',
      removedLabelPrefix: 'my_app:removed.v2',
    })
    expect(result.success).toBe(true)
  })
})

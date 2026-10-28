import { z } from 'zod'

export const TagPrefixSchema = z
  .string()
  .trim()
  .min(1, { error: 'Enter a prefix.' })
  .regex(/^[a-zA-Z0-9-]+$/, {
    error: 'Use only letters, numbers and hyphens.',
  })

export const RemovedTagPrefixSchema = TagPrefixSchema

export const TAG_PREFIX_DEFAULTS = {
  tagPrefix: 'pulsarr-user',
  removedTagPrefix: 'pulsarr-removed',
} as const

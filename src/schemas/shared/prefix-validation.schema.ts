import { z } from 'zod'

export const TagPrefixSchema = z
  .string()
  .trim()
  .min(1, { error: 'Enter a prefix.' })
  .regex(/^[a-zA-Z0-9_\-:.]+$/, {
    error: 'Use only letters, numbers, underscores, hyphens, colons and dots.',
  })

export const RemovedTagPrefixSchema = TagPrefixSchema

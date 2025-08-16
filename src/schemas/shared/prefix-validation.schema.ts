import { z } from 'zod'

/**
 * Shared tag prefix schema
 */
export const TagPrefixSchema = z
  .string()
  .trim()
  .min(1, { error: 'Tag prefix cannot be empty' })
  .regex(/^[a-zA-Z0-9_\-:.]+$/, {
    error:
      'Tag prefix can only contain letters, numbers, underscores, hyphens, colons, and dots',
  })

/**
 * Shared removed tag prefix schema
 */
export const RemovedTagPrefixSchema = z
  .string()
  .trim()
  .min(1, { error: 'Removed tag prefix cannot be empty' })
  .regex(/^[a-zA-Z0-9_\-:.]+$/, {
    error:
      'Removed tag prefix can only contain letters, numbers, underscores, hyphens, colons, and dots',
  })

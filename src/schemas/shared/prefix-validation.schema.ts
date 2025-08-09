import { z } from 'zod'

/**
 * Shared tag prefix schema
 */
export const TagPrefixSchema = z
  .string()
  .trim()
  .min(1, { message: 'Tag prefix cannot be empty' })
  .regex(/^[a-zA-Z0-9_\-:.]+$/, {
    message:
      'Tag prefix can only contain letters, numbers, underscores, hyphens, colons, and dots',
  })

/**
 * Shared removed tag prefix schema
 */
export const RemovedTagPrefixSchema = z
  .string()
  .trim()
  .min(1, { message: 'Removed tag prefix cannot be empty' })
  .regex(/^[a-zA-Z0-9_\-:.]+$/, {
    message:
      'Removed tag prefix can only contain letters, numbers, underscores, hyphens, colons, and dots',
  })

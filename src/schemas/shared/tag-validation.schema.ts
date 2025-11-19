import { z } from 'zod'

/**
 * Radarr v6 enforces strict tag validation: only lowercase letters, numbers, and hyphens
 * @see https://github.com/Radarr/Radarr/commit/62a05e2765ee603fa1a48806f1f20ccc936d8b8c
 */
export const TAG_LABEL_REGEX = /^[a-z0-9-]+$/

/**
 * Zod schema for validating tag labels according to Radarr v6 requirements
 * Validates that tags contain only lowercase letters, numbers, and hyphens
 */
export const TagLabelSchema = z
  .string()
  .trim()
  .min(1, { error: 'Tag label is required' })
  .regex(TAG_LABEL_REGEX, {
    error:
      'Tag must contain only lowercase letters (a-z), numbers (0-9), and hyphens (-)',
  })
  .refine((val) => !val.startsWith('-') && !val.endsWith('-'), {
    error: 'Tag cannot start or end with a hyphen',
  })

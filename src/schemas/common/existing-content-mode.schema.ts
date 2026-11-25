import { z } from 'zod'

export const EXISTING_CONTENT_MODES = ['off', 'dormant'] as const

export type ExistingContentMode = (typeof EXISTING_CONTENT_MODES)[number]

export const DEFAULT_EXISTING_CONTENT_MODE = 'off' satisfies ExistingContentMode

export const ExistingContentModeSchema = z.enum(EXISTING_CONTENT_MODES).meta({
  id: 'ExistingContentMode',
  description:
    'What a new watchlist request does when the item is already in the instance',
})

/** An unknown or missing stored value reads as the default. */
export function toExistingContentMode(
  value: string | null | undefined,
): ExistingContentMode {
  return (
    EXISTING_CONTENT_MODES.find((mode) => mode === value) ??
    DEFAULT_EXISTING_CONTENT_MODE
  )
}

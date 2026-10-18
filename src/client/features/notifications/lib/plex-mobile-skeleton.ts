import type { ComponentProps } from 'react'
import type { SettingsPageSkeleton } from '@/components/settings/settings-page-skeleton'

export const PLEX_MOBILE_SKELETON = {
  pill: true,
  sectionLabel: true,
  sections: [{ rows: ['switch', 'input', 'text'], description: false }],
} as const satisfies ComponentProps<typeof SettingsPageSkeleton>

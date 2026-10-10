import type { ComponentProps } from 'react'
import type { SettingsPageSkeleton } from '@/components/settings/settings-page-skeleton'

export const PLEX_LABELS_SKELETON = {
  sectionLabel: true,
  sections: [
    { rows: 2 },
    { rows: 3, pill: true },
    { rows: 1 },
    { rows: 2 },
    { rows: [{ radio: 3 }, 'field', 'field'] },
    { rows: 3 },
  ],
} as const satisfies ComponentProps<typeof SettingsPageSkeleton>

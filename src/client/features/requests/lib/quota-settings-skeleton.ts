import type { ComponentProps } from 'react'
import type { SettingsPageSkeleton } from '@/components/settings/settings-page-skeleton'

export const QUOTA_SETTINGS_SKELETON = {
  pill: false,
  sectionLabel: true,
  sections: [
    { rows: 3, pill: true },
    { rows: 1 },
    { rows: ['field', { radio: 3 }] },
    { rows: 2 },
    { rows: 2 },
  ],
} as const satisfies ComponentProps<typeof SettingsPageSkeleton>

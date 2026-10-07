import type { ComponentProps } from 'react'
import type { SettingsPageSkeleton } from '@/components/settings/settings-page-skeleton'

export const APPROVAL_SETTINGS_SKELETON = {
  pill: false,
  sectionLabel: true,
  sections: [{ rows: 3, pill: true }, { rows: 4 }, { rows: 1 }, { rows: 1 }],
} as const satisfies ComponentProps<typeof SettingsPageSkeleton>

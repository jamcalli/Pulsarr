import type { ComponentProps } from 'react'
import type { SettingsPageSkeleton } from '@/components/settings/settings-page-skeleton'

export const NEW_USER_DEFAULTS_SKELETON = {
  pill: false,
  sectionLabel: true,
  sections: [{ rows: 2 }, { rows: 6 }, { rows: 6 }],
} as const satisfies ComponentProps<typeof SettingsPageSkeleton>

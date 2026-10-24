import type { ComponentProps } from 'react'
import type { SettingsPageSkeleton } from '@/components/settings/settings-page-skeleton'

export const DELIVERY_SKELETON = {
  pill: false,
  sectionLabel: true,
  sections: [{ rows: 2 }, { rows: 2 }, { rows: ['switch'] }],
} as const satisfies ComponentProps<typeof SettingsPageSkeleton>

import type { ComponentProps } from 'react'
import type { SettingsPageSkeleton } from '@/components/settings/settings-page-skeleton'

export const APPRISE_SKELETON = {
  pill: true,
  sectionLabel: true,
  sections: [{ rows: ['text', 'text'] }, { rows: ['input', 'input'] }],
} as const satisfies ComponentProps<typeof SettingsPageSkeleton>

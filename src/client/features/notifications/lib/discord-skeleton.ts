import type { ComponentProps } from 'react'
import type { SettingsPageSkeleton } from '@/components/settings/settings-page-skeleton'

export const DISCORD_SKELETON = {
  pill: false,
  sectionLabel: true,
  sections: [
    { rows: ['input'] },
    { rows: ['input', 'input', 'input', 'text'], pill: true },
  ],
} as const satisfies ComponentProps<typeof SettingsPageSkeleton>

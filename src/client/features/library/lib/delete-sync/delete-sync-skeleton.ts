import type { ComponentProps } from 'react'
import type { SettingsPageSkeleton } from '@/components/settings/settings-page-skeleton'

export const DELETE_SYNC_SKELETON = {
  pill: false,
  sectionLabel: true,
  sections: [
    { rows: ['field', 'field', 'switch', 'input'], pill: true },
    { rows: [{ radio: 2 }, 'text'] },
    { rows: ['switch', 'switch', 'switch', 'switch', 'switch'] },
    { rows: ['switch', 'switch', 'input', 'switch', 'input'] },
    { rows: ['input', 'switch', 'text'] },
  ],
} as const satisfies ComponentProps<typeof SettingsPageSkeleton>

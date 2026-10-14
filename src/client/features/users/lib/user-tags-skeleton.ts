import type { ComponentProps } from 'react'
import type { SettingsPageSkeleton } from '@/components/settings/settings-page-skeleton'

export const USER_TAGS_SKELETON = {
  sectionLabel: true,
  sections: [
    { rows: 4 },
    { rows: ['switch', 'switch'] },
    { rows: ['input', 'field'] },
    { rows: [{ radio: 3 }, 'input', 'switch'] },
  ],
} as const satisfies ComponentProps<typeof SettingsPageSkeleton>

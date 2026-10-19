import { SettingsPageSkeleton } from '@/components/settings/settings-page-skeleton'

const SECTIONS = [
  { rows: ['input', 'input'], description: true },
  { rows: ['input', 'input'], description: true },
  { rows: ['input'], description: true },
] as const

export function AccountSkeleton() {
  return <SettingsPageSkeleton sections={SECTIONS} pill={false} sectionLabel />
}

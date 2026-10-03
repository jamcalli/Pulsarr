import { useContext } from 'react'
import { SettingsContext, type SettingsState } from '@/lib/settings'

export function useSettings(): SettingsState {
  const context = useContext(SettingsContext)
  if (!context)
    throw new Error('useSettings must be used within a SettingsProvider')
  return context
}

import { createContext } from 'react'
import { type PrefDef, parseBoolean } from '@/lib/prefs'

export interface SettingsState {
  fullscreenEnabled: boolean
  setFullscreenEnabled: (enabled: boolean) => void
}

export const fullscreenPref: PrefDef<boolean> = {
  key: 'pulsarr-fullscreen-enabled',
  fallback: false,
  parse: parseBoolean,
  serialize: String,
}

export const UNSAVED_CHANGES_REASON = 'Save or discard your changes first.'

export const SettingsContext = createContext<SettingsState | null>(null)

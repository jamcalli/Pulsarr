import { createContext } from 'react'
import { type PrefDef, parseBoolean } from '@/lib/prefs'

export interface SettingsState {
  asteroidsEnabled: boolean
  setAsteroidsEnabled: (enabled: boolean) => void
  fullscreenEnabled: boolean
  setFullscreenEnabled: (enabled: boolean) => void
}

export const asteroidsPref: PrefDef<boolean> = {
  key: 'pulsarr-asteroids-enabled',
  fallback: true,
  parse: parseBoolean,
  serialize: String,
}

export const fullscreenPref: PrefDef<boolean> = {
  key: 'pulsarr-fullscreen-enabled',
  fallback: false,
  parse: parseBoolean,
  serialize: String,
}

export const SettingsContext = createContext<SettingsState | null>(null)

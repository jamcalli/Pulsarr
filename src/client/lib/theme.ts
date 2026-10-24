import { createContext } from 'react'
import { type PrefDef, parseOneOf } from '@/lib/prefs'

export type Theme = 'light' | 'dark'

// Lockstep: the pre-paint script in index.html reads this key and treats anything but 'light' as dark.
export const themePref: PrefDef<Theme> = {
  key: 'pulsarr-theme',
  fallback: 'dark',
  parse: parseOneOf(['light', 'dark']),
  serialize: (value) => value,
}

export interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const ThemeContext = createContext<ThemeState | null>(null)

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(theme)
}

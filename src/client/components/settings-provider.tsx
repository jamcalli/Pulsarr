import { type ReactNode, useMemo } from 'react'
import { usePref } from '@/lib/prefs'
import { asteroidsPref, fullscreenPref, SettingsContext } from '@/lib/settings'

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [asteroidsEnabled, setAsteroidsEnabled] = usePref(asteroidsPref)
  const [fullscreenEnabled, setFullscreenEnabled] = usePref(fullscreenPref)

  const value = useMemo(
    () => ({
      asteroidsEnabled,
      setAsteroidsEnabled,
      fullscreenEnabled,
      setFullscreenEnabled,
    }),
    [
      asteroidsEnabled,
      setAsteroidsEnabled,
      fullscreenEnabled,
      setFullscreenEnabled,
    ],
  )

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  )
}

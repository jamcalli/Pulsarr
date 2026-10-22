import { type ReactNode, useMemo } from 'react'
import { usePref } from '@/lib/prefs'
import { fullscreenPref, SettingsContext } from '@/lib/settings'

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [fullscreenEnabled, setFullscreenEnabled] = usePref(fullscreenPref)

  const value = useMemo(
    () => ({
      fullscreenEnabled,
      setFullscreenEnabled,
    }),
    [fullscreenEnabled, setFullscreenEnabled],
  )

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  )
}

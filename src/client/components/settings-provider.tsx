'use client'
import * as React from 'react'
import { createContext, useContext } from 'react'
import { type PrefDef, parseBoolean, usePref } from '@/lib/prefs'

type SettingsProviderProps = {
  children: React.ReactNode
}

type SettingsProviderState = {
  asteroidsEnabled: boolean
  setAsteroidsEnabled: (enabled: boolean) => void
  fullscreenEnabled: boolean
  setFullscreenEnabled: (enabled: boolean) => void
}

const initialState: SettingsProviderState = {
  asteroidsEnabled: true,
  setAsteroidsEnabled: () => null,
  fullscreenEnabled: false,
  setFullscreenEnabled: () => null,
}

const asteroidsPref: PrefDef<boolean> = {
  key: 'pulsarr-asteroids-enabled',
  fallback: true,
  parse: parseBoolean,
  serialize: String,
}

const fullscreenPref: PrefDef<boolean> = {
  key: 'pulsarr-fullscreen-enabled',
  fallback: false,
  parse: parseBoolean,
  serialize: String,
}

const SettingsProviderContext =
  createContext<SettingsProviderState>(initialState)

/**
 * Provides asteroid and fullscreen settings, along with their update functions, to descendant components via React context.
 *
 * Settings persist as preferences, defaulting to `true` for asteroids and `false` for fullscreen.
 *
 * @param children - The React nodes to render within the provider.
 */
export function SettingsProvider({
  children,
  ...props
}: SettingsProviderProps) {
  const [asteroidsEnabled, setAsteroidsEnabled] = usePref(asteroidsPref)
  const [fullscreenEnabled, setFullscreenEnabled] = usePref(fullscreenPref)

  const value = React.useMemo(
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
    <SettingsProviderContext.Provider {...props} value={value}>
      {children}
    </SettingsProviderContext.Provider>
  )
}

export const useSettings = () => {
  const context = useContext(SettingsProviderContext)

  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }

  return context
}

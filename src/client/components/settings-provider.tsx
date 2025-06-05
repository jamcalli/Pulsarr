'use client'
import * as React from 'react'
import { createContext, useContext, useState } from 'react'

type SettingsProviderProps = {
  children: React.ReactNode
}

type SettingsProviderState = {
  asteroidsEnabled: boolean
  setAsteroidsEnabled: (enabled: boolean) => void
}

const initialState: SettingsProviderState = {
  asteroidsEnabled: true,
  setAsteroidsEnabled: () => null,
}

const SettingsProviderContext =
  createContext<SettingsProviderState>(initialState)

/**
 * Provides the asteroids-enabled setting and its updater to descendant components via React context.
 *
 * Initializes the `asteroidsEnabled` state from localStorage, defaulting to `true` if unavailable or invalid. Updates to the setting are persisted to localStorage when possible.
 *
 * @param children - React nodes to be rendered within the provider.
 *
 * @remark
 * If localStorage access fails, the state is still updated but changes will not persist across reloads.
 */
export function SettingsProvider({
  children,
  ...props
}: SettingsProviderProps) {
  const [asteroidsEnabled, setAsteroidsEnabledState] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('pulsarr-asteroids-enabled')
      return stored !== null ? JSON.parse(stored) : true
    } catch (error) {
      console.warn('Failed to load asteroids setting:', error)
      return true
    }
  })

  const setAsteroidsEnabled = React.useCallback((enabled: boolean) => {
    try {
      localStorage.setItem('pulsarr-asteroids-enabled', JSON.stringify(enabled))
      setAsteroidsEnabledState(enabled)
    } catch (error) {
      console.error('Failed to save asteroids setting:', error)
      // Still update state even if localStorage fails
      setAsteroidsEnabledState(enabled)
    }
  }, [])

  const value = React.useMemo(
    () => ({
      asteroidsEnabled,
      setAsteroidsEnabled,
    }),
    [asteroidsEnabled, setAsteroidsEnabled],
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

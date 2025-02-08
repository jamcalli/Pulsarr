'use client'
import * as React from 'react'
import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'

type ThemeProviderProps = {
  children: React.ReactNode
  attribute?: string
  defaultTheme?: Theme
  enableSystem?: boolean
  storageKey?: string
  themes?: string[]
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
  themes: string[]
}

const initialState: ThemeProviderState = {
  theme: 'system',
  setTheme: () => null,
  themes: ['light', 'dark'],
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  attribute = 'class',
  defaultTheme = 'system',
  enableSystem = true,
  storageKey = 'vite-ui-theme',
  themes = ['light', 'dark'],
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const storedTheme = localStorage.getItem(storageKey) as Theme | null
    if (storedTheme && storedTheme !== 'system') {
      return storedTheme
    }

    if (enableSystem) {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
        .matches
        ? 'dark'
        : 'light'
      return systemTheme
    }

    return defaultTheme
  })

  useEffect(() => {
    const root = window.document.documentElement

    const applyTheme = (newTheme: Theme) => {
      root.classList.remove(...themes)

      const finalTheme =
        newTheme === 'system' && enableSystem
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
          : newTheme

      if (attribute === 'class') {
        root.classList.add(finalTheme)
      } else {
        root.setAttribute(attribute, finalTheme)
      }
    }

    applyTheme(theme)
  }, [theme, attribute, themes, enableSystem])

  useEffect(() => {
    if (!enableSystem) return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleSystemThemeChange = () => {
      if (theme === 'system') {
        const root = window.document.documentElement
        root.classList.remove(...themes)
        root.classList.add(mediaQuery.matches ? 'dark' : 'light')
      }
    }

    mediaQuery.addEventListener('change', handleSystemThemeChange)
    return () =>
      mediaQuery.removeEventListener('change', handleSystemThemeChange)
  }, [theme, themes, enableSystem])

  const setTheme = React.useCallback(
    (newTheme: Theme) => {
      localStorage.setItem(storageKey, newTheme)
      setThemeState(newTheme)
    },
    [storageKey],
  )

  const value = React.useMemo(
    () => ({
      theme,
      setTheme,
      themes,
    }),
    [theme, setTheme, themes],
  )

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }

  return context
}

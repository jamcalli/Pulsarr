'use client'
import * as React from 'react'
import { createContext, useContext, useEffect, useState } from 'react'

type ThemeProviderProps = {
  children: React.ReactNode
  attribute?: string
  defaultTheme?: string
  enableSystem?: boolean
  storageKey?: string
  themes?: string[]
}

type ThemeProviderState = {
  theme: string | undefined
  setTheme: (theme: string) => void
  themes: string[]
}

const initialState: ThemeProviderState = {
  theme: undefined,
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
  const [theme, setThemeState] = useState<string>(() => {
    if (enableSystem) {
      return defaultTheme
    }
    return localStorage.getItem(storageKey) || defaultTheme
  })

  useEffect(() => {
    const root = window.document.documentElement

    if (attribute === 'class') {
      root.classList.remove(...themes)

      if (theme === 'system' && enableSystem) {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
          .matches
          ? 'dark'
          : 'light'
        root.classList.add(systemTheme)
      } else {
        root.classList.add(theme)
      }
    } else {
      root.setAttribute(attribute, theme)
    }
  }, [theme, attribute, themes, enableSystem])

  useEffect(() => {
    if (enableSystem) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

      const handleChange = () => {
        if (theme === 'system') {
          const root = window.document.documentElement
          root.classList.remove(...themes)
          root.classList.add(mediaQuery.matches ? 'dark' : 'light')
        }
      }

      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }
  }, [theme, themes, enableSystem])

  const setTheme = React.useCallback(
    (theme: string) => {
      localStorage.setItem(storageKey, theme)
      setThemeState(theme)
    },
    [storageKey],
  )

  const value = {
    theme,
    setTheme,
    themes,
  }

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

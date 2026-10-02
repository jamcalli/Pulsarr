import { useContext } from 'react'
import { ThemeContext, type ThemeState } from '@/lib/theme'

export function useTheme(): ThemeState {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within a ThemeProvider')
  return context
}

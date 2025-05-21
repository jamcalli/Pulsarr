// DocModeToggle.tsx - A direct wrapper around the client ModeToggle
import React from 'react'
import { useColorMode } from '@docusaurus/theme-common'
import { Moon, Sun } from 'lucide-react'

// Re-implement the Button component from client to avoid import issues
function Button({
  children,
  onClick,
  className = '',
}: {
  children: React.ReactNode
  onClick: () => void
  className?: string
}) {
  const { colorMode } = useColorMode()
  const isDark = colorMode === 'dark'

  // These styles directly match your neutralnoShadow button variant
  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap' as const,
    borderRadius: '5px',
    fontSize: '0.875rem',
    fontWeight: 500,
    height: '2.5rem', // 40px (h-10)
    width: '2.5rem', // 40px (w-10)
    border: '2px solid #000',
    backgroundColor: isDark ? '#212121' : '#e4dfda', // --bw in light/dark mode
    color: isDark ? '#e6e6e6' : '#000', // --text in light/dark mode
    position: 'relative' as const,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  }

  return (
    <button type="button" style={style} onClick={onClick} className={className}>
      {children}
    </button>
  )
}

export function DocModeToggle() {
  const { colorMode, setColorMode } = useColorMode()
  const isDark = colorMode === 'dark'

  const toggleTheme = () => {
    setColorMode(isDark ? 'light' : 'dark')
  }

  return (
    <Button onClick={toggleTheme}>
      <Sun
        size={20}
        style={{
          position: 'absolute',
          opacity: isDark ? 0 : 1,
          transform: isDark ? 'rotate(-90deg) scale(0)' : 'rotate(0) scale(1)',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          color: isDark ? '#e6e6e6' : '#000', // --text in light/dark mode
        }}
        aria-hidden="true"
      />
      <Moon
        size={20}
        style={{
          position: 'absolute',
          opacity: isDark ? 1 : 0,
          transform: isDark ? 'rotate(0) scale(1)' : 'rotate(90deg) scale(0)',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          color: isDark ? '#e6e6e6' : '#000', // --text in light/dark mode
        }}
        aria-hidden="true"
      />
      <span className="sr-only">
        Switch to {isDark ? 'light' : 'dark'} mode
      </span>
    </Button>
  )
}

import { useColorMode } from '@docusaurus/theme-common'
import { Moon, Sun } from 'lucide-react'

export function ThemeButtonAdapter() {
  const { colorMode, setColorMode } = useColorMode()

  const toggleTheme = () => {
    const newTheme = colorMode === 'dark' ? 'light' : 'dark'
    setColorMode(newTheme)
  }

  // Define button styles for neutral/noShadow variant matching your client implementation
  // Your ModeToggle.tsx specifically uses className="h-7 w-7" (28px x 28px)
  const buttonStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '5px',
    backgroundColor: colorMode === 'dark' ? '#212121' : '#e4dfda',
    border: '2px solid #000',
    width: '1.75rem', // 28px - matching h-7 w-7 from your mode-toggle.tsx
    height: '1.75rem', // 28px
    position: 'relative' as const,
    cursor: 'pointer',
    overflow: 'hidden',
  }

  const isDarkMode = colorMode === 'dark'

  return (
    <button
      type="button"
      style={buttonStyle}
      onClick={toggleTheme}
      aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <Sun
        className={`h-[1.2rem] w-[1.2rem] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-200 ${
          isDarkMode
            ? 'rotate-[-90deg] scale-0 opacity-0'
            : 'rotate-0 scale-100 opacity-100'
        }`}
        color={isDarkMode ? '#e6e6e6' : '#000'}
        aria-hidden="true"
      />
      <Moon
        className={`h-[1.2rem] w-[1.2rem] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-200 ${
          isDarkMode
            ? 'rotate-0 scale-100 opacity-100'
            : 'rotate-90 scale-0 opacity-0'
        }`}
        color={isDarkMode ? '#e6e6e6' : '#000'}
        aria-hidden="true"
      />
      <span className="sr-only">
        Switch to {isDarkMode ? 'light' : 'dark'} mode
      </span>
    </button>
  )
}

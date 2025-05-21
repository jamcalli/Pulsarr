import React from 'react'
import { Moon, Sun } from 'lucide-react'
import styles from './styles.module.css'

type Props = {
  className?: string
  value: string
  onChange: (newValue: string) => void
}

export default function CustomColorModeToggle({
  className,
  value,
  onChange,
}: Props): React.ReactElement {
  const isDarkMode = value === 'dark'

  const toggleColorMode = () => {
    onChange(isDarkMode ? 'light' : 'dark')
  }

  // Apply theme-specific styles directly
  const buttonStyle = {
    backgroundColor: isDarkMode ? '#212121' : '#e4dfda',
    color: isDarkMode ? '#e6e6e6' : '#000',
    border: '2px solid #000',
    borderRadius: '5px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '40px',
    width: '40px',
    padding: '0',
    position: 'relative' as const,
    overflow: 'hidden',
    cursor: 'pointer',
  }

  return (
    <button
      type="button"
      style={buttonStyle}
      className={className ?? ''}
      onClick={toggleColorMode}
      aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <Sun
        className={`${styles.sunIcon} ${isDarkMode ? styles.darkIcon : styles.lightIcon}`}
        aria-hidden="true"
        size={20}
        color={isDarkMode ? '#e6e6e6' : '#000'}
      />
      <Moon
        className={`${styles.moonIcon} ${isDarkMode ? styles.darkIcon : styles.lightIcon}`}
        aria-hidden="true"
        size={20}
        color={isDarkMode ? '#e6e6e6' : '#000'}
      />
      <span className="sr-only">
        Switch to {isDarkMode ? 'light' : 'dark'} mode
      </span>
    </button>
  )
}

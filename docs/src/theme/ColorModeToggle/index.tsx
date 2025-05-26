import React from 'react'
import { Moon, Sun } from 'lucide-react'
import styles from './styles.module.css'

type Props = {
  className?: string
  buttonClassName?: string
  value: string
  onChange: (newValue: string) => void
  type?: 'default' | 'noShadow' | 'neutralnoShadow'
}

export default function ColorModeToggle({
  className,
  buttonClassName,
  value,
  onChange,
  type = 'default',
}: Props): React.ReactElement {
  const isDarkMode = value === 'dark'

  const toggleColorMode = () => {
    onChange(isDarkMode ? 'light' : 'dark')
  }

  let buttonStyleClass = styles.buttonStyle

  if (type === 'noShadow') {
    buttonStyleClass = `${styles.buttonStyle} ${styles.noShadow}`
  } else if (type === 'neutralnoShadow') {
    buttonStyleClass = `${styles.buttonStyle} ${styles.noShadow} ${styles.neutral}`
  }

  return (
    <div className={className}>
      <button
        type="button"
        className={`${buttonStyleClass} ${buttonClassName ?? ''}`}
        onClick={toggleColorMode}
        aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        <Sun className={styles.sunIcon} aria-hidden="true" size={20} />
        <Moon className={styles.moonIcon} aria-hidden="true" size={20} />
        <span className="sr-only">
          Switch to {isDarkMode ? 'light' : 'dark'} mode
        </span>
      </button>
    </div>
  )
}

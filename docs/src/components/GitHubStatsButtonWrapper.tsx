import React, { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import GitHubStatsButton from './GitHubStatsButton'

/**
 * Helper component that ensures GitHub stats button is rendered and persists
 */
export default function GitHubStatsButtonWrapper(): React.ReactElement {
  useEffect(() => {
    // Function to ensure button is always present
    function ensureButton() {
      try {
        // Skip if button already exists
        const existingButton = document.querySelector(
          '#github-stats-button button',
        )
        if (existingButton) return

        // Find or create the container
        let container = document.getElementById('github-stats-button')
        if (!container) {
          const navbarRight = document.querySelector('.navbar__items--right')
          if (!navbarRight) return

          // Create the container
          container = document.createElement('div')
          container.id = 'github-stats-button'

          // Insert before the last child (usually theme toggle)
          navbarRight.insertBefore(container, navbarRight.lastChild)
        }

        // Only render if container is empty
        if (!container.hasChildNodes()) {
          const root = createRoot(container)
          root.render(<GitHubStatsButton />)
        }
      } catch (error) {
        console.error('Error rendering GitHub stats button:', error)
      }
    }

    // Initial render
    ensureButton()

    // Setup regular checking to ensure button stays rendered
    const intervalId = setInterval(ensureButton, 500)

    // Clean up on unmount
    return () => clearInterval(intervalId)
  }, [])

  // This is a helper component that doesn't render anything directly
  return null
}

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import GitHubStatsButton from '@site/src/components/GitHubStatsButton'
import GitHubStatsButtonWrapper from '@site/src/components/GitHubStatsButtonWrapper'
import { useLocation } from '@docusaurus/router'

// This component wraps the entire Docusaurus app
export default function Root({ children }): React.ReactElement {
  const location = useLocation()
  const [root, setRoot] = useState(null)
  const renderCountRef = useRef(0)
  const timeoutIdsRef = useRef([])

  // Clear all timeouts to avoid memory leaks
  const clearAllTimeouts = useCallback(() => {
    timeoutIdsRef.current.forEach((id) => clearTimeout(id))
    timeoutIdsRef.current = []
  }, [])

  // Add a timeout that we can clean up later
  const addTimeout = useCallback((callback, delay) => {
    const id = setTimeout(() => {
      callback()
      // Remove this id from our tracking array
      timeoutIdsRef.current = timeoutIdsRef.current.filter(
        (timeoutId) => timeoutId !== id,
      )
    }, delay)
    timeoutIdsRef.current.push(id)
    return id
  }, [])

  // Define renderGitHubButton at the component level
  const renderGitHubButton = useCallback(() => {
    // Increment render count for debugging
    renderCountRef.current += 1

    // First check if button already exists
    const existingButton = document.querySelector('#github-stats-button button')
    if (existingButton) {
      return // Button is already rendered, no need to continue
    }

    // Find the button container
    const container = document.getElementById('github-stats-button')

    // If container exists and is empty, render the button
    if (container && !container.hasChildNodes()) {
      try {
        // If we already have a root, use it, otherwise create a new one
        let reactRoot = root
        if (!reactRoot) {
          reactRoot = createRoot(container)
          setRoot(reactRoot)
        }

        reactRoot.render(<GitHubStatsButton />)
      } catch (error) {
        console.error('Error rendering GitHub stats button:', error)
      }
    }
    // Handle the case where container doesn't exist
    else if (!container) {
      // Check if we're in the navbar
      const navbarRight = document.querySelector('.navbar__items--right')

      if (navbarRight) {
        // Create the container if it doesn't exist
        const newContainer = document.createElement('div')
        newContainer.id = 'github-stats-button'

        // Insert before the last child (usually the theme toggle)
        navbarRight.insertBefore(newContainer, navbarRight.lastChild)

        // Now render to this new container
        try {
          const reactRoot = createRoot(newContainer)
          setRoot(reactRoot)
          reactRoot.render(<GitHubStatsButton />)
        } catch (error) {
          console.error(
            'Error creating new container for GitHub stats button:',
            error,
          )
        }
      }
    }
  }, [root])

  // Schedule multiple render attempts with increasing delays
  const scheduleRenders = useCallback(() => {
    // Clear any existing timeouts first
    clearAllTimeouts()

    // Attempt immediate render
    renderGitHubButton()

    // Schedule multiple attempts with increasing delays
    const delays = [50, 100, 200, 500, 1000, 2000]
    delays.forEach((delay) => {
      addTimeout(renderGitHubButton, delay)
    })
  }, [renderGitHubButton, clearAllTimeouts, addTimeout])

  // Re-render on location change (page navigation)
  useEffect(() => {
    scheduleRenders()
  }, [location.pathname, scheduleRenders])

  // Main setup effect
  useEffect(() => {
    // Create observer to monitor DOM changes
    const setupMutationObserver = () => {
      if (typeof MutationObserver !== 'undefined') {
        // Observe the entire document for changes
        const observer = new MutationObserver(() => {
          renderGitHubButton()
        })

        // Observe the entire document body with all options enabled
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
        })

        return observer
      }
      return null
    }

    // Specifically watch for navigation DOM changes
    const setupNavObserver = () => {
      if (typeof MutationObserver !== 'undefined') {
        const observer = new MutationObserver((mutations) => {
          // Process in reverse order to prioritize navbar changes
          for (let i = mutations.length - 1; i >= 0; i--) {
            const mutation = mutations[i]
            // Check if navbar or its children were modified
            const target = mutation.target as HTMLElement
            if (
              target.classList &&
              (target.classList.contains('navbar') ||
                target.classList.contains('navbar__items') ||
                target.classList.contains('navbar__items--right'))
            ) {
              scheduleRenders()
              return
            }
          }
        })

        // Try to observe navbar specifically if it exists
        const navbar = document.querySelector('.navbar')
        if (navbar) {
          observer.observe(navbar, {
            childList: true,
            subtree: true,
            attributes: true,
          })
        }

        return observer
      }
      return null
    }

    // Handle dynamic page updates - override history methods
    const patchHistoryMethods = () => {
      const originalPushState = window.history.pushState
      const originalReplaceState = window.history.replaceState

      window.history.pushState = function () {
        const result = originalPushState.apply(this, arguments)
        scheduleRenders()
        return result
      }

      window.history.replaceState = function () {
        const result = originalReplaceState.apply(this, arguments)
        scheduleRenders()
        return result
      }

      return { originalPushState, originalReplaceState }
    }

    // Initial setup and renders
    scheduleRenders()

    // Handle resize events (particularly important for mobile layout)
    const handleResize = () => {
      scheduleRenders()
    }
    window.addEventListener('resize', handleResize)

    // Setup observers
    const bodyObserver = setupMutationObserver()
    const navObserver = setupNavObserver()

    // Patch history methods for SPA navigation
    const { originalPushState, originalReplaceState } = patchHistoryMethods()

    // Add event listener for browser back/forward navigation
    const handlePopstate = () => {
      scheduleRenders()
    }
    window.addEventListener('popstate', handlePopstate)

    // Handle any Docusaurus-specific navigation events
    document.addEventListener('docusaurus.navigateFinished', scheduleRenders)

    // Try to check for any click events on navigation elements
    const handleClick = (e) => {
      // Look for navigation-related elements in the click path
      let element = e.target
      while (element) {
        if (
          element.tagName === 'A' ||
          (element.getAttribute && element.getAttribute('href')) ||
          (element.classList &&
            (element.classList.contains('navbar__item') ||
              element.classList.contains('menu__link')))
        ) {
          // Schedule renders after a short delay to catch navigation
          addTimeout(scheduleRenders, 50)
          addTimeout(scheduleRenders, 200)
          addTimeout(scheduleRenders, 500)
          break
        }
        element = element.parentElement
      }
    }
    document.addEventListener('click', handleClick)

    // Clean up everything on unmount
    return () => {
      clearAllTimeouts()
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('popstate', handlePopstate)
      document.removeEventListener(
        'docusaurus.navigateFinished',
        scheduleRenders,
      )
      document.removeEventListener('click', handleClick)

      // Restore original history methods
      window.history.pushState = originalPushState
      window.history.replaceState = originalReplaceState

      // Disconnect observers
      if (bodyObserver) bodyObserver.disconnect()
      if (navObserver) navObserver.disconnect()
    }
  }, [renderGitHubButton, scheduleRenders, clearAllTimeouts, addTimeout])

  // Use both approaches to ensure button persistence
  return (
    <>
      <GitHubStatsButtonWrapper />
      {children}
    </>
  )
}

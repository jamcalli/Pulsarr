import { useCallback, useState } from 'react'

export type MediaViewMode = 'carousel' | 'list'

/** Persisted desktop view mode for a dashboard section (mobile always lists). */
export function useMediaViewMode(
  viewKey: string,
  defaultView: MediaViewMode = 'carousel',
) {
  const storageKey = `pulsarr-${viewKey}-view`

  const [view, setViewState] = useState<MediaViewMode>(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored === 'carousel' || stored === 'list') {
        return stored
      }
    } catch (error) {
      console.warn(`Failed to load view mode for ${viewKey}:`, error)
    }
    return defaultView
  })

  const setView = useCallback(
    (newView: MediaViewMode) => {
      try {
        localStorage.setItem(storageKey, newView)
      } catch (error) {
        console.error(`Failed to save view mode for ${viewKey}:`, error)
      }
      setViewState(newView)
    },
    [storageKey, viewKey],
  )

  return { view, setView }
}

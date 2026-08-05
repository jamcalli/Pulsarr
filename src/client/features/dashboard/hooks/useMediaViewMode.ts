import { useMemo } from 'react'
import { type PrefDef, parseOneOf, usePref } from '@/lib/prefs'

export type MediaViewMode = 'carousel' | 'list'

const parseViewMode = parseOneOf(['carousel', 'list'])

/** Persisted desktop view mode for a dashboard section (mobile always lists). */
export function useMediaViewMode(
  viewKey: string,
  defaultView: MediaViewMode = 'carousel',
) {
  const def = useMemo<PrefDef<MediaViewMode>>(
    () => ({
      key: `pulsarr-${viewKey}-view`,
      fallback: defaultView,
      parse: parseViewMode,
      serialize: (value) => value,
    }),
    [viewKey, defaultView],
  )

  const [view, setView] = usePref(def)

  return { view, setView }
}

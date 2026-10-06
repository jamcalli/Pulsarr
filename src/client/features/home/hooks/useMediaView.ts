import type { MediaView } from '@/features/home/lib/home-prefs'
import { useIsMobile } from '@/hooks/useIsMobile'
import { type PrefDef, usePref } from '@/lib/prefs'

/** Phones always get the carousel, the saved choice applies from `md` up. */
export function useMediaView(
  def: PrefDef<MediaView>,
): [MediaView, (view: MediaView) => void] {
  const [saved, setView] = usePref(def)
  const isMobile = useIsMobile()
  return [isMobile ? 'carousel' : saved, setView]
}

import { useState } from 'react'

/** Returns null once `src` fails to load, and tries again when `src` changes. */
export function useImageFallback(src: string | null) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  return {
    src: src === failedSrc ? null : src,
    onError: () => setFailedSrc(src),
  }
}

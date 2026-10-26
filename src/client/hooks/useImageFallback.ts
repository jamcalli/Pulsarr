import { useState } from 'react'

/** Returns null for a src that already failed, so only a different src loads. */
export function useImageFallback(src: string | null) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  return {
    src: src === failedSrc ? null : src,
    onError: () => setFailedSrc(src),
  }
}

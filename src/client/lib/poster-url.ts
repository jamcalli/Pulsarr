const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p'
const CARD_SIZE = 'w300_and_h450_face'
const TMDB_URL_PATTERN = /^https?:\/\/image\.tmdb\.org\/t\/p\/[^/]+(\/.+)$/

/** Resolves a stored thumb (a TMDB path, a TMDB URL or another image URL) to a card-sized image URL. */
export function posterCardUrl(thumb: string | null): string | null {
  if (!thumb) return null
  const tmdbPath = thumb.match(TMDB_URL_PATTERN)?.[1]
  if (tmdbPath) return `${TMDB_IMAGE_BASE}/${CARD_SIZE}${tmdbPath}`
  if (thumb.startsWith('http')) return thumb
  return `${TMDB_IMAGE_BASE}/${CARD_SIZE}${thumb}`
}

export function backdropUrl(path: string | null): string | null {
  return path ? `${TMDB_IMAGE_BASE}/w1280${path}` : null
}

export function providerLogoUrl(path: string | null): string | null {
  return path ? `${TMDB_IMAGE_BASE}/w92${path}` : null
}

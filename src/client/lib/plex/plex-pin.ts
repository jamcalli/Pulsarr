export const PIN_POLL_INTERVAL_MS = 5000

const PLEX_LINK_URL = 'https://plex.tv/link'

type PinPhase = 'creating' | 'waiting' | 'approved' | 'expired' | 'failed'

/** The code's own link fills it in, so the admin only approves. */
export function plexLinkHref(code: string): string {
  return `${PLEX_LINK_URL}?${new URLSearchParams({ pin: code })}`
}

/** Spaced out so a screen reader reads the code one character at a time. */
export function spokenCode(code: string): string {
  return `Code ${code.split('').join(' ')}`
}

export function pinPhase({
  failed,
  hasPin,
  authToken,
  expiresIn,
}: {
  failed: boolean
  hasPin: boolean
  authToken: string | null
  expiresIn: number | null
}): PinPhase {
  if (failed) return 'failed'
  if (!hasPin) return 'creating'
  if (authToken) return 'approved'
  if (expiresIn !== null && expiresIn <= 0) return 'expired'
  return 'waiting'
}

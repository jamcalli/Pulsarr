// Avatar URLs (plex.tv/users/<uuid>/avatar) are the only stable global
// identity a session payload carries
export function extractUuidFromThumb(thumb: string | undefined): string | null {
  const match = thumb?.match(/plex\.tv\/users\/([a-f0-9]+)\/avatar/i)
  return match?.[1] ?? null
}

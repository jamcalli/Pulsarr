/**
 * Plex avatar URLs embed the account's plex.tv uuid
 * (https://plex.tv/users/<uuid>/avatar). Session payloads carry no other
 * stable global identity, so this is the join key back to stored users.
 */
export function extractUuidFromThumb(thumb: string | undefined): string | null {
  const match = thumb?.match(/plex\.tv\/users\/([a-f0-9]+)\/avatar/i)
  return match?.[1] ?? null
}

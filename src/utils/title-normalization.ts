/** Case, accent, punctuation and trailing "(year)" insensitive key for comparing a show title across Plex and Sonarr. */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s*\(\d{4}\)\s*$/, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

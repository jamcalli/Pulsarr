export function toContentType(
  type: string | null | undefined,
): 'movie' | 'show' {
  return type?.toLowerCase() === 'show' ? 'show' : 'movie'
}

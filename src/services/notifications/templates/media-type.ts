export function mediaTypeLabel(type: string): {
  label: string
  emoji: string
} {
  const normalized = type ? type.toLowerCase() : ''

  if (normalized === 'movie') {
    return { label: 'Movie', emoji: '🎬' }
  }
  if (normalized === 'show' || normalized === 'tv' || normalized === 'series') {
    return { label: 'Show', emoji: '📺' }
  }
  return { label: 'Media', emoji: '🎬' }
}

import { backdropUrl, posterCardUrl, providerLogoUrl } from '@/lib/poster-url'

describe('posterCardUrl', () => {
  it('builds a card-sized TMDB URL from a stored path', () => {
    expect(posterCardUrl('/abc.jpg')).toBe(
      'https://image.tmdb.org/t/p/w300_and_h450_face/abc.jpg',
    )
  })

  it('resizes a full TMDB URL to the card size', () => {
    expect(posterCardUrl('https://image.tmdb.org/t/p/original/abc.jpg')).toBe(
      'https://image.tmdb.org/t/p/w300_and_h450_face/abc.jpg',
    )
  })

  it('passes other image URLs through and returns null without a thumb', () => {
    expect(posterCardUrl('https://metadata-static.plex.tv/abc.jpg')).toBe(
      'https://metadata-static.plex.tv/abc.jpg',
    )
    expect(posterCardUrl(null)).toBeNull()
  })
})

describe('backdropUrl and providerLogoUrl', () => {
  it('size a TMDB path and pass null through', () => {
    expect(backdropUrl('/bg.jpg')).toBe(
      'https://image.tmdb.org/t/p/w1280/bg.jpg',
    )
    expect(providerLogoUrl('/logo.png')).toBe(
      'https://image.tmdb.org/t/p/w92/logo.png',
    )
    expect(backdropUrl(null)).toBeNull()
    expect(providerLogoUrl(null)).toBeNull()
  })
})

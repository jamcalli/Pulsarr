import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import type { ReactNode } from 'react'
import { useMediaDetail } from '@/features/home/hooks/useMediaDetail'
import { usePrefetchMediaDetail } from '@/features/home/hooks/usePrefetchMediaDetail'
import type { MediaItem } from '@/features/home/lib/media-item'
import { useConfig } from '@/hooks/useConfig'
import { queryClient } from '@/lib/queryClient'
import { server } from '../../../setup.js'

const dune: MediaItem = {
  title: 'Dune',
  type: 'movie',
  guids: ['tmdb:438631'],
  thumb: null,
}

const metadata = {
  details: {
    adult: false,
    backdrop_path: '/backdrop.jpg',
    belongs_to_collection: null,
    budget: 0,
    genres: [],
    homepage: '',
    id: 438631,
    imdb_id: null,
    origin_country: [],
    original_language: 'en',
    original_title: 'Dune',
    overview: '',
    popularity: 0,
    poster_path: '/poster.jpg',
    production_companies: [],
    production_countries: [],
    release_date: '2021-09-15',
    revenue: 0,
    runtime: 155,
    spoken_languages: [],
    status: 'Released',
    tagline: null,
    title: 'Dune',
    video: false,
    vote_average: 0,
    vote_count: 0,
  },
  watchProviders: {},
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

function mockEndpoints(status: 200 | 404 = 200) {
  const requests: string[] = []
  server.use(
    http.get('/v1/config', () =>
      HttpResponse.json({ success: true, config: { tmdbRegion: 'CA' } }),
    ),
    http.get('/v1/tmdb/metadata/:id', ({ request }) => {
      requests.push(request.url)
      return status === 404
        ? HttpResponse.json(
            { statusCode: 404, error: 'Not Found', message: 'No metadata' },
            { status: 404 },
          )
        : HttpResponse.json({ success: true, message: 'ok', metadata })
    }),
  )
  return requests
}

async function renderPrefetch() {
  const { result } = renderHook(
    () => ({ prefetch: usePrefetchMediaDetail(), config: useConfig().config }),
    { wrapper },
  )
  await waitFor(() => expect(result.current.config).not.toBeNull())
  return result.current.prefetch
}

function metadataQueries() {
  return queryClient
    .getQueryCache()
    .findAll({ queryKey: ['get', '/v1/tmdb/metadata/{id}'] })
}

afterEach(() => {
  queryClient.clear()
})

describe('usePrefetchMediaDetail', () => {
  it('fills the exact cache entry the dialog reads', async () => {
    const requests = mockEndpoints()
    const prefetch = await renderPrefetch()

    act(() => prefetch(dune))
    await waitFor(() => expect(metadataQueries()[0]?.state.data).toBeDefined())

    const { result } = renderHook(
      () => useMediaDetail({ open: true, guid: 'tmdb:438631', type: 'movie' }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.metadata).toBeDefined())

    expect(requests).toHaveLength(1)
    expect(requests[0]).toContain('region=CA')
    expect(metadataQueries()).toHaveLength(1)
  })

  it('does nothing for an item without a TMDB or TVDB id', async () => {
    const requests = mockEndpoints()
    const prefetch = await renderPrefetch()

    act(() => prefetch({ ...dune, guids: ['imdb:tt1160419'] }))

    expect(metadataQueries()).toHaveLength(0)
    expect(requests).toHaveLength(0)
  })

  it('settles a 404 without throwing', async () => {
    const requests = mockEndpoints(404)
    const prefetch = await renderPrefetch()

    expect(() => act(() => prefetch(dune))).not.toThrow()
    await waitFor(() =>
      expect(metadataQueries()[0]?.state.status).toBe('error'),
    )

    expect(requests).toHaveLength(1)
  })
})

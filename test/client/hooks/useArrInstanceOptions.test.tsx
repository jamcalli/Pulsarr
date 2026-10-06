import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import type { ReactNode } from 'react'
import { useArrInstanceOptions } from '@/hooks/useArrInstanceOptions'
import { queryClient } from '@/lib/queryClient'
import { server } from '../setup.js'

function instance(id: number, apiKey: string) {
  return {
    id,
    name: `Radarr ${id}`,
    baseUrl: 'http://radarr:7878',
    apiKey,
    bypassIgnored: false,
    tags: [],
    isDefault: id === 1,
  }
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

function mockEndpoints() {
  const lookups: string[] = []
  const meta = {
    success: true,
    instance: { id: 1, name: 'Radarr 1', baseUrl: 'http://radarr:7878' },
  }
  server.use(
    http.get('/v1/radarr/instances', () =>
      HttpResponse.json([instance(1, 'real-key'), instance(2, 'placeholder')]),
    ),
    http.get('/v1/radarr/quality-profiles', ({ request }) => {
      lookups.push(request.url)
      return HttpResponse.json({
        ...meta,
        qualityProfiles: [{ id: 4, name: 'HD-1080p' }],
      })
    }),
    http.get('/v1/radarr/root-folders', ({ request }) => {
      lookups.push(request.url)
      return HttpResponse.json({
        ...meta,
        rootFolders: [{ id: 1, path: '/movies' }],
      })
    }),
    http.get('/v1/radarr/tags', ({ request }) => {
      lookups.push(request.url)
      return HttpResponse.json({ ...meta, tags: [{ id: 9, label: 'kids' }] })
    }),
  )
  return lookups
}

afterEach(() => {
  queryClient.clear()
})

describe('useArrInstanceOptions', () => {
  it('maps profiles, folders and tags to string-valued options', async () => {
    mockEndpoints()
    const { result } = renderHook(
      () => useArrInstanceOptions('radarr', 1, true),
      { wrapper },
    )

    await waitFor(() => expect(result.current.tags).toHaveLength(1))
    await waitFor(() => expect(result.current.rootFolders).toHaveLength(1))
    await waitFor(() => expect(result.current.qualityProfiles).toHaveLength(1))
    expect(result.current.connected).toBe(true)
    expect(result.current.qualityProfiles).toEqual([
      { value: '4', label: 'HD-1080p' },
    ])
    expect(result.current.rootFolders).toEqual([
      { value: '/movies', label: '/movies' },
    ])
    expect(result.current.tags).toEqual([{ value: '9', label: 'kids' }])
    expect(result.current.errorMessage).toBeNull()
  })

  it('fetches nothing without an instance id', async () => {
    const lookups = mockEndpoints()
    const { result } = renderHook(
      () => useArrInstanceOptions('radarr', null, true),
      { wrapper },
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(lookups).toEqual([])
    expect(result.current.connected).toBe(false)
    expect(result.current.errorMessage).toBeNull()
  })

  it('reports a placeholder-key instance as not connected without fetching', async () => {
    const lookups = mockEndpoints()
    const { result } = renderHook(
      () => useArrInstanceOptions('radarr', 2, true),
      { wrapper },
    )

    await waitFor(() =>
      expect(result.current.errorMessage).toBe(
        'This instance is not connected. Check its API key.',
      ),
    )
    expect(result.current.connected).toBe(false)
    expect(lookups).toEqual([])
  })

  it('stays idle while disabled', async () => {
    const lookups = mockEndpoints()
    renderHook(() => useArrInstanceOptions('radarr', 1, false), { wrapper })

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(lookups).toEqual([])
  })
})

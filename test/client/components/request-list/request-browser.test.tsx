import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { ReactNode } from 'react'
import { RequestBrowserItems } from '@/components/request-list/request-browser'
import {
  type RequestBrowser,
  useRequestBrowser,
} from '@/hooks/useRequestBrowser'
import { queryClient } from '@/lib/queryClient'
import type { components } from '@/types/api.js'
import { server } from '../../setup.js'

type RecentRequest = components['schemas']['RecentRequestItem']

function item(id: number, title: string): RecentRequest {
  return {
    id,
    source: 'watchlist',
    title,
    key: `key-${id}`,
    contentType: 'movie',
    guids: [`tmdb:${id}`],
    thumb: null,
    status: 'requested',
    userId: 2,
    userName: 'mayar88',
    createdAt: '2026-10-10T00:00:00Z',
    primaryInstance: null,
    allInstances: [],
  }
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

function fakeBrowser(): RequestBrowser {
  return {
    selection: null,
    setOpen: vi.fn(),
    onSelect: vi.fn(),
    onIntent: vi.fn(),
  }
}

describe('useRequestBrowser', () => {
  beforeEach(() => {
    server.use(
      http.get('/v1/config', () =>
        HttpResponse.json({ success: true, config: { tmdbRegion: 'US' } }),
      ),
    )
  })

  afterEach(() => {
    queryClient.clear()
  })

  it('opens the selected request and follows its live copy in the list', () => {
    let items = [item(1, 'Dune')]
    const { result, rerender } = renderHook(() => useRequestBrowser(items), {
      wrapper,
    })

    act(() => result.current.onSelect(items[0]))
    items = [item(1, 'Dune: Part Two')]
    rerender()

    expect(result.current.selection?.open).toBe(true)
    expect(result.current.selection?.item.title).toBe('Dune: Part Two')
  })

  it('keeps the clicked snapshot once the request leaves the list', () => {
    let items: RecentRequest[] | undefined = [item(1, 'Dune')]
    const { result, rerender } = renderHook(() => useRequestBrowser(items), {
      wrapper,
    })

    act(() => result.current.onSelect(item(1, 'Dune')))
    items = undefined
    rerender()

    expect(result.current.selection?.item.title).toBe('Dune')
  })
})

describe('RequestBrowserItems', () => {
  beforeEach(() => {
    server.use(
      http.get('/v1/users/list', () =>
        HttpResponse.json({ success: true, message: 'ok', users: [] }),
      ),
    )
  })

  afterEach(() => {
    queryClient.clear()
  })

  it('selects a request from the list view', async () => {
    const user = userEvent.setup()
    const browser = fakeBrowser()
    const dune = item(1, 'Dune')
    render(
      <RequestBrowserItems browser={browser} items={[dune]} view="list" />,
      {
        wrapper,
      },
    )

    await user.click(screen.getByRole('button', { name: /Dune/ }))
    expect(browser.onSelect).toHaveBeenCalledWith(dune)
  })

  it('selects a request from the poster view', async () => {
    const user = userEvent.setup()
    const browser = fakeBrowser()
    const dune = item(1, 'Dune')
    render(
      <RequestBrowserItems browser={browser} items={[dune]} view="carousel" />,
      { wrapper },
    )

    await user.click(await screen.findByRole('button', { name: /Dune/ }))
    expect(browser.onSelect).toHaveBeenCalledWith(dune)
  })
})

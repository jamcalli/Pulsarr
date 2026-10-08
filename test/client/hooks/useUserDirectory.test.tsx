import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import type { ReactNode } from 'react'
import { useUserDirectory } from '@/hooks/useUserDirectory'
import { queryClient } from '@/lib/queryClient'
import { server } from '../setup.js'

function user(id: number, name: string, alias: string | null) {
  return {
    id,
    name,
    apprise: null,
    alias,
    discord_id: null,
    notify_apprise: false,
    notify_discord: false,
    notify_discord_mention: false,
    notify_plex_mobile: false,
    can_sync: true,
    requires_approval: false,
    is_primary_token: false,
    avatar: `https://plex.tv/${name}.png`,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

function mockUsers() {
  server.use(
    http.get('/v1/users/list', () =>
      HttpResponse.json({
        success: true,
        message: 'ok',
        users: [user(1, 'Sarah', 'Mom'), user(2, 'jamie', null)],
      }),
    ),
  )
}

async function renderDirectory() {
  mockUsers()
  const { result } = renderHook(() => useUserDirectory().lookup, { wrapper })
  await waitFor(() => expect(result.current('jamie').avatar).not.toBeNull())
  return result
}

afterEach(() => {
  queryClient.clear()
})

describe('useUserDirectory', () => {
  it('shows the alias when one is set', async () => {
    const result = await renderDirectory()
    expect(result.current('Sarah')).toEqual({
      name: 'Mom',
      avatar: 'https://plex.tv/Sarah.png',
    })
  })

  it('falls back to the username when the alias is null', async () => {
    const result = await renderDirectory()
    expect(result.current('jamie')).toEqual({
      name: 'jamie',
      avatar: 'https://plex.tv/jamie.png',
    })
  })

  it('looks users up case-insensitively', async () => {
    const result = await renderDirectory()
    expect(result.current('sarah').name).toBe('Mom')
    expect(result.current('JAMIE').avatar).toBe('https://plex.tv/jamie.png')
  })

  it('returns an unknown user as itself with no avatar', async () => {
    const result = await renderDirectory()
    expect(result.current('ghost')).toEqual({ name: 'ghost', avatar: null })
  })

  it('lists every user by display name', async () => {
    mockUsers()
    const { result } = renderHook(() => useUserDirectory().users, { wrapper })
    await waitFor(() =>
      expect(result.current).toEqual([
        { id: 1, name: 'Mom' },
        { id: 2, name: 'jamie' },
      ]),
    )
  })
})

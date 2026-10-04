import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { SettingsProvider } from '@/components/settings-provider'
import { AppSidebar } from '@/components/sidebar/app-sidebar'
import { ThemeProvider } from '@/components/theme-provider'
import { SidebarProvider } from '@/components/ui/sidebar'
import { NAV_SECTIONS } from '@/lib/navigation'
import { queryClient } from '@/lib/queryClient'
import { useProgressStore } from '@/stores/progressStore'
import { server } from '../../setup.js'

function approvalStats(pending: number) {
  return HttpResponse.json({
    success: true,
    message: 'ok',
    stats: {
      pending,
      approved: 0,
      rejected: 0,
      expired: 0,
      auto_approved: 0,
      totalRequests: pending,
    },
  })
}

function syncStatus(status: 'running' | 'stopped') {
  useProgressStore.setState({
    systemStatusCache: {
      'watchlist-workflow-status': {
        operationId: 'watchlist-workflow-status',
        type: 'system',
        phase: 'info',
        progress: 0,
        message: 'Watchlist workflow status',
        metadata: { status, syncMode: 'rss' },
      },
    },
  })
}

function mockApi({ pending = 0 } = {}) {
  const logout = { calls: 0 }
  server.use(
    http.get('/v1/users/me', () =>
      HttpResponse.json({
        success: true,
        message: 'ok',
        user: {
          id: 1,
          username: 'admin',
          email: 'admin@example.com',
          role: 'admin',
          avatar: null,
          plexConnected: true,
        },
      }),
    ),
    http.get('/v1/approval/stats', () => approvalStats(pending)),
    http.get('/v1/system/update-status', () =>
      HttpResponse.json({
        currentVersion: '0.19.4',
        latestVersion: '0.19.4',
        updateAvailable: false,
        releaseUrl: null,
        releaseName: null,
        releaseBody: null,
        releaseBodyHtml: null,
        publishedAt: null,
        lastCheckedAt: null,
        lastError: null,
        status: 'ok',
      }),
    ),
    http.post('/v1/users/logout', () => {
      logout.calls++
      return HttpResponse.json({ success: true, message: 'Logged out' })
    }),
  )
  return logout
}

function renderSidebar(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <SidebarProvider>
            <AppSidebar />
          </SidebarProvider>
        ),
      },
    ],
    { initialEntries: [path] },
  )
  render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SettingsProvider>
          <RouterProvider router={router} />
        </SettingsProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
  return router
}

describe('AppSidebar', () => {
  beforeEach(() => {
    vi.stubGlobal('__APP_VERSION__', '0.19.4')
    // keeps subscribers from opening the progress EventSource
    useProgressStore.setState({ isConnecting: true, systemStatusCache: {} })
  })

  afterEach(() => {
    queryClient.clear()
    vi.unstubAllGlobals()
  })

  it('renders every section from the nav model', () => {
    mockApi()
    renderSidebar('/')

    for (const section of NAV_SECTIONS) {
      expect(screen.getByText(section.label)).toBeInTheDocument()
    }
  })

  it('expands only the active section', () => {
    mockApi()
    renderSidebar('/approvals/settings')

    expect(
      screen.getByRole('link', { name: 'Approval settings' }),
    ).toHaveAttribute('href', '/approvals/settings')
    expect(screen.getByRole('link', { name: 'Quotas' })).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Plex users' }),
    ).not.toBeInTheDocument()
  })

  it('expands a collapsed section on click', async () => {
    mockApi()
    const user = userEvent.setup()
    renderSidebar('/')

    await user.click(screen.getByRole('button', { name: 'Users' }))

    expect(screen.getByRole('link', { name: 'User tags' })).toHaveAttribute(
      'href',
      '/utilities/user-tags',
    )
  })

  it('keeps one section open at a time', async () => {
    mockApi()
    const user = userEvent.setup()
    renderSidebar('/approvals')

    await user.click(screen.getByRole('button', { name: 'Users' }))

    expect(screen.getByRole('link', { name: 'User tags' })).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Quotas' }),
    ).not.toBeInTheDocument()
  })

  it('opens the section the route moves to', async () => {
    mockApi()
    const user = userEvent.setup()
    const router = renderSidebar('/approvals')
    await user.click(screen.getByRole('button', { name: 'Users' }))

    await router.navigate('/utilities/log-viewer')

    expect(
      await screen.findByRole('link', { name: 'Logs' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'User tags' }),
    ).not.toBeInTheDocument()
  })

  it('shows the pending approvals badge on Requests', async () => {
    mockApi({ pending: 4 })
    renderSidebar('/')

    const requests = screen.getByRole('button', { name: /Requests/ })
    expect(await within(requests).findByText('4')).toBeInTheDocument()
  })

  it('hides the badge when nothing is pending', async () => {
    mockApi({ pending: 0 })
    renderSidebar('/')

    await screen.findByText('admin')
    expect(screen.getByRole('button', { name: 'Requests' })).toHaveTextContent(
      /^Requests$/,
    )
  })

  it('keeps the user menu open on display toggles, asteroids only when windowed', async () => {
    mockApi()
    const user = userEvent.setup()
    renderSidebar('/')

    await user.click(await screen.findByText('admin'))
    expect(
      await screen.findByRole('menuitem', { name: 'Account settings' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Display')).toBeInTheDocument()
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Asteroids' }),
    ).toBeChecked()

    await user.click(screen.getByRole('menuitem', { name: 'Full screen' }))

    expect(
      screen.queryByRole('menuitemcheckbox', { name: 'Asteroids' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', { name: 'Windowed' }),
    ).toBeInTheDocument()
  })

  it('logs out through the confirm dialog and goes to the login page', async () => {
    const logout = mockApi()
    const user = userEvent.setup()
    const router = renderSidebar('/')

    await user.click(await screen.findByText('admin'))
    await user.click(await screen.findByRole('menuitem', { name: 'Log out' }))
    const dialog = await screen.findByRole('dialog', { name: 'Log out?' })
    await user.click(within(dialog).getByRole('button', { name: 'Log out' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(logout.calls).toBe(1)
  })

  describe('sync popover', () => {
    function mockSync({ startStatus = 200, isReady = false } = {}) {
      const calls = {
        start: 0,
        stop: 0,
        config: [] as Array<Record<string, boolean>>,
      }
      server.use(
        http.get('/v1/config', () =>
          HttpResponse.json({ success: true, config: { _isReady: isReady } }),
        ),
        http.put('/v1/config', async ({ request }) => {
          const body = (await request.json()) as Record<string, boolean>
          calls.config.push(body)
          return HttpResponse.json({ success: true, config: body })
        }),
        http.post('/v1/watchlist-workflow/start', () => {
          calls.start++
          return startStatus === 200
            ? HttpResponse.json({ success: true, status: 'starting' })
            : HttpResponse.json(
                {
                  statusCode: 400,
                  error: 'Bad Request',
                  message: 'Plex is not configured',
                },
                { status: 400 },
              )
        }),
        http.post('/v1/watchlist-workflow/stop', () => {
          calls.stop++
          return HttpResponse.json({ success: true, status: 'stopping' })
        }),
      )
      return calls
    }

    it('starts a stopped sync', async () => {
      mockApi()
      const calls = mockSync()
      syncStatus('stopped')
      const user = userEvent.setup()
      renderSidebar('/')

      await user.click(screen.getByRole('button', { name: /Sync stopped/ }))
      const panel = await screen.findByRole('dialog', {
        name: 'Watchlist sync',
      })
      expect(within(panel).getByText('stopped')).toBeInTheDocument()
      await user.click(
        within(panel).getByRole('button', { name: 'Start sync' }),
      )

      await waitFor(() => expect(calls.start).toBe(1))
      expect(calls.stop).toBe(0)
    })

    it('stops a running sync', async () => {
      mockApi()
      const calls = mockSync()
      syncStatus('running')
      const user = userEvent.setup()
      renderSidebar('/')

      await user.click(screen.getByRole('button', { name: /Sync running/ }))
      const panel = await screen.findByRole('dialog', {
        name: 'Watchlist sync',
      })
      await user.click(within(panel).getByRole('button', { name: 'Stop sync' }))

      await waitFor(() => expect(calls.stop).toBe(1))
    })

    it('shows a failed start inline', async () => {
      mockApi()
      mockSync({ startStatus: 400 })
      syncStatus('stopped')
      const user = userEvent.setup()
      renderSidebar('/')

      await user.click(screen.getByRole('button', { name: /Sync stopped/ }))
      const panel = await screen.findByRole('dialog', {
        name: 'Watchlist sync',
      })
      await user.click(
        within(panel).getByRole('button', { name: 'Start sync' }),
      )

      expect(
        await within(panel).findByText('Plex is not configured'),
      ).toBeInTheDocument()
    })

    it('saves start on launch to config', async () => {
      mockApi()
      const calls = mockSync({ isReady: false })
      syncStatus('running')
      const user = userEvent.setup()
      renderSidebar('/')

      await user.click(screen.getByRole('button', { name: /Sync running/ }))
      const toggle = await screen.findByRole('switch', {
        name: 'Start on launch',
      })
      await waitFor(() => expect(toggle).toBeEnabled())
      expect(toggle).not.toBeChecked()
      await user.click(toggle)

      await waitFor(() => expect(calls.config).toEqual([{ _isReady: true }]))
      await waitFor(() => expect(toggle).toBeChecked())
    })

    it('links to the logs and closes', async () => {
      mockApi()
      mockSync()
      syncStatus('running')
      const user = userEvent.setup()
      const router = renderSidebar('/')

      await user.click(screen.getByRole('button', { name: /Sync running/ }))
      await user.click(await screen.findByRole('link', { name: 'View logs' }))

      expect(router.state.location.pathname).toBe('/utilities/log-viewer')
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      )
    })
  })
})

import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import UserTagsPage from '@/features/users/pages/user-tags'
import { setFormatLocale } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { useProgressStore } from '@/stores/progressStore'
import { server } from '../../../setup.js'
import { stubViewport } from '../../../viewport.js'

const savedConfig = {
  tagUsersInSonarr: true,
  tagUsersInRadarr: true,
  cleanupOrphanedTags: true,
  removedTagMode: 'remove',
  removedTagPrefix: 'pulsarr-removed',
  tagPrefix: 'pulsarr-user',
  tagNamingSource: 'username',
}

const emptyCounts = { tagged: 0, skipped: 0, failed: 0 }
const emptyCleanup = { removed: 0, skipped: 0, failed: 0, instances: 0 }

function mockEndpoints() {
  server.use(
    http.get('/v1/config', () =>
      HttpResponse.json({ success: true, config: savedConfig }),
    ),
    http.get('/v1/tags/status', () =>
      HttpResponse.json({ success: true, tagsExist: false, instances: [] }),
    ),
    http.post('/v1/tags/sync', () =>
      HttpResponse.json({
        success: true,
        message: 'Synchronized tags for 5 items (3 Sonarr, 2 Radarr)',
        mode: 'sync',
        sonarr: { tagged: 3, skipped: 0, failed: 0 },
        radarr: { tagged: 2, skipped: 0, failed: 0 },
        orphanedCleanup: { sonarr: emptyCleanup, radarr: emptyCleanup },
      }),
    ),
  )
}

function renderPage() {
  const router = createMemoryRouter([{ path: '*', element: <UserTagsPage /> }])
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('UserTagsPage', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
    stubViewport({ mobile: false })
    useProgressStore.setState({ isConnecting: true, systemStatusCache: {} })
  })

  afterEach(() => {
    queryClient.clear()
    setFormatLocale(undefined)
    vi.unstubAllGlobals()
  })

  it('shows the sync results', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Sync' }))

    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('shows the reason a sync was refused instead of results', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    server.use(
      http.post('/v1/tags/sync', () =>
        HttpResponse.json({
          success: false,
          message:
            'Tag synchronization skipped: user tagging is disabled in configuration',
          mode: 'sync',
          sonarr: emptyCounts,
          radarr: emptyCounts,
          orphanedCleanup: { sonarr: emptyCleanup, radarr: emptyCleanup },
        }),
      ),
    )
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Sync' }))

    expect(
      await screen.findByText(
        'Tag synchronization skipped: user tagging is disabled in configuration',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText(/^Ran at/)).not.toBeInTheDocument()
  })
})

import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import DeliveryPage from '@/features/notifications/pages/delivery'
import { setFormatLocale } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { server } from '../../../setup.js'
import { stubViewport } from '../../../viewport.js'

const savedConfig = {
  queueWaitTime: 120_000,
  newEpisodeThreshold: 172_800_000,
  notifyOnUpdate: 'webhook-only',
  watchlistAddNotify: 'all',
  notifyOnAvailability: true,
}

function mockEndpoints(config: object = savedConfig) {
  const configBodies: unknown[] = []
  server.use(
    http.get('/v1/config', () => HttpResponse.json({ success: true, config })),
    http.put('/v1/config', async ({ request }) => {
      const body = await request.json()
      configBodies.push(body)
      return HttpResponse.json({
        success: true,
        config: { ...config, ...(body as object) },
      })
    }),
  )
  return { configBodies }
}

function renderPage() {
  const router = createMemoryRouter([{ path: '*', element: <DeliveryPage /> }])
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('DeliveryPage', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
    stubViewport({ mobile: false })
  })

  afterEach(() => {
    queryClient.clear()
    setFormatLocale(undefined)
    vi.unstubAllGlobals()
  })

  it('shows the stored milliseconds in minutes and hours', async () => {
    mockEndpoints()
    renderPage()

    expect(await screen.findByLabelText('Queue wait time')).toHaveValue('2')
    expect(screen.getByLabelText('New episode threshold')).toHaveValue('48')
    expect(
      screen.getByText("Waits 2 minutes to group a show's episodes."),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Episodes aired in the last 48 hours notify right away.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Update notifications')).toHaveTextContent(
      'Discord webhook only',
    )
    expect(screen.getByLabelText('Watchlist additions')).toHaveTextContent(
      'All channels',
    )
    expect(
      screen.getByRole('switch', { name: 'Availability notifications' }),
    ).toBeChecked()
  })

  it('saves minutes and hours back as milliseconds', async () => {
    const user = userEvent.setup()
    const { configBodies } = mockEndpoints()
    renderPage()

    const queue = await screen.findByLabelText('Queue wait time')
    await user.clear(queue)
    await user.type(queue, '0')
    expect(
      screen.getByText('Sends each episode as soon as it is ready.'),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole('switch', { name: 'Availability notifications' }),
    )
    expect(
      screen.getByText('Off. Sonarr or Radarr tell users instead.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Changes saved')).toBeInTheDocument()
    expect(configBodies).toEqual([
      { ...savedConfig, queueWaitTime: 0, notifyOnAvailability: false },
    ])
  })

  it('keeps a stored alias selectable under its equivalent label', async () => {
    const user = userEvent.setup()
    const { configBodies } = mockEndpoints({
      ...savedConfig,
      watchlistAddNotify: 'discord-both',
    })
    renderPage()

    expect(
      await screen.findByLabelText('Watchlist additions'),
    ).toHaveTextContent('Discord webhook and direct messages')
    await user.click(
      screen.getByRole('switch', { name: 'Availability notifications' }),
    )
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Changes saved')).toBeInTheDocument()
    expect(configBodies).toEqual([
      {
        ...savedConfig,
        watchlistAddNotify: 'discord-both',
        notifyOnAvailability: false,
      },
    ])
  })
})

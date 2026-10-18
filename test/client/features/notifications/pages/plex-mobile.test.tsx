import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import PlexMobilePage from '@/features/notifications/pages/plex-mobile'
import { setFormatLocale } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { useProgressStore } from '@/stores/progressStore'
import { server } from '../../../setup.js'
import { stubViewport } from '../../../viewport.js'

const SWITCH = 'Send to Plex mobile apps'

function setPlexMobileStatus(status: string) {
  useProgressStore.setState({
    systemStatusCache: {
      'plex-mobile-status': {
        operationId: 'plex-mobile-status',
        type: 'system',
        phase: 'info',
        progress: 100,
        message: `Plex mobile status: ${status}`,
        metadata: { status },
      },
    },
  })
}

const listedUsers = [
  { id: 8, name: 'sam', alias: null },
  { id: 7, name: 'riley', alias: 'Riley' },
]

function mockEndpoints(config: object = { plexMobileEnabled: false }) {
  const configBodies: unknown[] = []
  const pushes: { userId: string; body: unknown }[] = []
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
    http.get('/v1/users/list', () =>
      HttpResponse.json({ success: true, users: listedUsers }),
    ),
    http.post<{ userId: string }>(
      '/v1/notifications/test/users/:userId',
      async ({ params, request }) => {
        pushes.push({ userId: params.userId, body: await request.json() })
        return HttpResponse.json({ success: true, responseTime: 418 })
      },
    ),
  )
  return { configBodies, pushes }
}

function renderPage() {
  const router = createMemoryRouter([
    { path: '*', element: <PlexMobilePage /> },
  ])
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('PlexMobilePage', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
    stubViewport({ mobile: false })
  })

  afterEach(() => {
    queryClient.clear()
    setFormatLocale(undefined)
    useProgressStore.setState({ systemStatusCache: {} })
    vi.unstubAllGlobals()
  })

  it('saves the switch through the save bar', async () => {
    const user = userEvent.setup()
    setPlexMobileStatus('disabled')
    const { configBodies } = mockEndpoints()
    renderPage()

    expect(await screen.findByText('Disabled')).toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: SWITCH }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Changes saved')).toBeInTheDocument()
    expect(configBodies).toEqual([{ plexMobileEnabled: true }])
  })

  it('locks the switch without Plex Pass and keeps its value', async () => {
    setPlexMobileStatus('no_plex_pass')
    mockEndpoints({ plexMobileEnabled: true })
    renderPage()

    expect(await screen.findByText('No Plex Pass')).toBeInTheDocument()
    expect(
      screen.getAllByText('Needs Plex Pass on the connected Plex server.'),
    ).toHaveLength(1)
    const toggle = screen.getByRole('switch', { name: SWITCH })
    expect(toggle).toHaveAttribute('aria-disabled', 'true')
    expect(toggle).toBeChecked()
    expect(screen.queryByRole('button', { name: 'Plex connection' })).toBeNull()
  })

  it('points to Plex connection when no server is connected', async () => {
    setPlexMobileStatus('not_configured')
    mockEndpoints()
    renderPage()

    expect(await screen.findByText('Not configured')).toBeInTheDocument()
    expect(screen.getAllByText('Connect a Plex server first.')).toHaveLength(1)
    expect(screen.getByRole('switch', { name: SWITCH })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(
      screen.getByRole('button', { name: 'Plex connection' }),
    ).toHaveAttribute('href', '/system/plex')
  })

  it('shows no pill and no lock before the status arrives', async () => {
    mockEndpoints()
    renderPage()

    expect(
      await screen.findByRole('switch', { name: SWITCH }),
    ).not.toHaveAttribute('aria-disabled', 'true')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows the enabled pill', async () => {
    setPlexMobileStatus('enabled')
    mockEndpoints({ plexMobileEnabled: true })
    renderPage()

    expect(await screen.findByText('Enabled')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: SWITCH })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(
      screen.getByRole('link', { name: 'Plex app settings' }),
    ).toHaveAttribute(
      'href',
      'https://jamcalli.github.io/Pulsarr/docs/notifications/plex-mobile#mobile-app-setup',
    )
  })

  it.each([
    ['disabled', true],
    ['enabled', false],
  ])(
    'blocks the test push while %s and saved on is %s',
    async (status, enabled) => {
      setPlexMobileStatus(status)
      mockEndpoints({ plexMobileEnabled: enabled })
      renderPage()

      expect(await screen.findByLabelText('Send to')).toBeDisabled()
      expect(
        screen.getByText('Save with Plex mobile turned on to send a test.'),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Send test' })).toBeDisabled()
    },
  )

  it.each([
    ['not_configured', 'Connect a Plex server first.'],
    ['no_plex_pass', 'Needs Plex Pass on the connected Plex server.'],
  ])(
    'disables the test push under the %s lock without a second reason',
    async (status, lockReason) => {
      setPlexMobileStatus(status)
      mockEndpoints({ plexMobileEnabled: false })
      renderPage()

      expect(await screen.findByLabelText('Send to')).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Send test' })).toBeDisabled()
      expect(screen.getAllByText(lockReason)).toHaveLength(1)
      expect(
        screen.queryByText('Save with Plex mobile turned on to send a test.'),
      ).toBeNull()
    },
  )

  it('blocks the test push while the form has unsaved changes', async () => {
    const user = userEvent.setup()
    setPlexMobileStatus('enabled')
    mockEndpoints({ plexMobileEnabled: true })
    renderPage()

    expect(await screen.findByLabelText('Send to')).toBeEnabled()
    await user.click(screen.getByRole('switch', { name: SWITCH }))

    expect(
      screen.getByText('Save or discard your changes first.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Send to')).toBeDisabled()
  })

  it('sends a test push to a picked user', async () => {
    const user = userEvent.setup()
    setPlexMobileStatus('enabled')
    const { pushes } = mockEndpoints({ plexMobileEnabled: true })
    renderPage()

    const input = await screen.findByLabelText('Send to')
    expect(screen.getByRole('button', { name: 'Send test' })).toBeDisabled()
    await user.click(input)
    expect(
      (await screen.findAllByRole('option')).map(
        (option) => option.textContent,
      ),
    ).toEqual(['Riley', 'sam'])
    await user.click(screen.getByRole('option', { name: 'Riley' }))
    expect(input).toHaveValue('Riley')
    await user.click(screen.getByRole('button', { name: 'Send test' }))

    expect(await screen.findByText('in 418 ms')).toBeInTheDocument()
    expect(pushes).toEqual([{ userId: '7', body: { channel: 'plex-mobile' } }])
  })

  it('keeps the second pick when the recipient changes', async () => {
    const user = userEvent.setup()
    setPlexMobileStatus('enabled')
    const { pushes } = mockEndpoints({ plexMobileEnabled: true })
    renderPage()

    const input = await screen.findByLabelText('Send to')
    await user.click(input)
    await user.click(await screen.findByRole('option', { name: 'Riley' }))
    await user.click(input)
    await user.click(await screen.findByRole('option', { name: 'sam' }))
    expect(input).toHaveValue('sam')
    await user.click(screen.getByRole('button', { name: 'Send test' }))

    expect(await screen.findByText('in 418 ms')).toBeInTheDocument()
    expect(pushes).toEqual([{ userId: '8', body: { channel: 'plex-mobile' } }])
  })

  it('shows the server error when the push is refused', async () => {
    const user = userEvent.setup()
    setPlexMobileStatus('enabled')
    mockEndpoints({ plexMobileEnabled: true })
    server.use(
      http.post('/v1/notifications/test/users/:userId', () =>
        HttpResponse.json(
          {
            statusCode: 400,
            error: 'Bad Request',
            message: 'sam has Plex mobile notifications turned off.',
          },
          { status: 400 },
        ),
      ),
    )
    renderPage()

    await user.click(await screen.findByLabelText('Send to'))
    await user.click(await screen.findByRole('option', { name: 'sam' }))
    await user.click(screen.getByRole('button', { name: 'Send test' }))

    expect(
      await screen.findByText('sam has Plex mobile notifications turned off.'),
    ).toBeInTheDocument()
  })
})

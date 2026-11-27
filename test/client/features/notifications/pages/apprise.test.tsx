import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import ApprisePage from '@/features/notifications/pages/apprise'
import { setFormatLocale } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { server } from '../../../setup.js'
import { stubViewport } from '../../../viewport.js'

const savedConfig = {
  appriseUrl: 'http://apprise:8000',
  enableApprise: true,
  appriseEmailSender: 'mailtos://alerts:pw@gmail.com',
  systemAppriseUrl: 'tgram://bot/chat,admin@example.com',
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
  const router = createMemoryRouter([{ path: '*', element: <ApprisePage /> }])
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('ApprisePage', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
    stubViewport({ mobile: false })
  })

  afterEach(() => {
    queryClient.clear()
    setFormatLocale(undefined)
    vi.unstubAllGlobals()
  })

  it('shows the server and saves the system settings', async () => {
    const user = userEvent.setup()
    const { configBodies } = mockEndpoints()
    renderPage()

    expect(await screen.findByText('Enabled')).toBeInTheDocument()
    expect(screen.getByLabelText('Server URL')).toHaveValue(
      'http://apprise:8000',
    )
    expect(
      screen.getByRole('link', { name: 'Apprise URL formats' }),
    ).toHaveAttribute('href', 'https://appriseit.com/')
    expect(screen.getByLabelText('Apprise URLs, URL 2')).toHaveValue(
      'admin@example.com',
    )
    expect(screen.getByLabelText('Apprise URLs, URL 2')).toHaveAttribute(
      'type',
      'password',
    )

    await user.click(screen.getByRole('button', { name: 'Remove URL 1' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Changes saved')).toBeInTheDocument()
    expect(configBodies).toEqual([
      {
        appriseUrl: savedConfig.appriseUrl,
        appriseEmailSender: savedConfig.appriseEmailSender,
        systemAppriseUrl: 'admin@example.com',
      },
    ])
  })

  it('saves a new server URL', async () => {
    const user = userEvent.setup()
    const { configBodies } = mockEndpoints()
    renderPage()

    const serverUrl = await screen.findByLabelText('Server URL')
    await user.clear(serverUrl)
    await user.type(serverUrl, 'http://192.168.1.100:8000')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Changes saved')).toBeInTheDocument()
    expect(configBodies).toEqual([
      {
        appriseUrl: 'http://192.168.1.100:8000',
        appriseEmailSender: savedConfig.appriseEmailSender,
        systemAppriseUrl: savedConfig.systemAppriseUrl,
      },
    ])
  })

  it('masks the email sender until revealed', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()

    const sender = await screen.findByLabelText('Email sender')
    expect(sender).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Show email sender' }))
    expect(sender).toHaveAttribute('type', 'text')
    expect(sender).toHaveValue(savedConfig.appriseEmailSender)
  })

  it('locks the system settings while Apprise is unreachable', async () => {
    mockEndpoints({ ...savedConfig, enableApprise: false })
    renderPage()

    expect(await screen.findByText('Unreachable')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Apprise is unreachable, so these settings do nothing until the server answers.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "Pulsarr can't reach this server. It keeps checking and turns Apprise on once the server answers.",
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Server URL')).toBeEnabled()
    expect(screen.getByLabelText('Email sender')).toBeDisabled()
    expect(screen.getByLabelText('Apprise URLs, URL 1')).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Apprise setup' })).toHaveAttribute(
      'href',
      'https://jamcalli.github.io/Pulsarr/notifications/apprise',
    )
  })

  it('asks for a server URL when none is set', async () => {
    mockEndpoints({ ...savedConfig, appriseUrl: '', enableApprise: false })
    renderPage()

    expect(await screen.findByText('Not configured')).toBeInTheDocument()
    expect(screen.getByLabelText('Server URL')).toHaveValue('')
    expect(screen.getByLabelText('Server URL')).toBeEnabled()
    expect(
      screen.getByText(
        'Enter the address of your Apprise server to turn on Apprise notifications.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Set up an Apprise server to use these settings.'),
    ).toBeInTheDocument()
  })
})

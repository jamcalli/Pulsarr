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
    expect(screen.getByText('http://apprise:8000')).toBeInTheDocument()
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
        appriseEmailSender: savedConfig.appriseEmailSender,
        systemAppriseUrl: 'admin@example.com',
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

    expect(await screen.findByText('Disabled')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Apprise is disabled, so these settings do nothing until it is reachable.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Email sender')).toBeDisabled()
    expect(screen.getByLabelText('Apprise URLs, URL 1')).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Apprise setup' })).toHaveAttribute(
      'href',
      'https://jamcalli.github.io/Pulsarr/docs/notifications/apprise',
    )
  })

  it('points to the environment when no server is set', async () => {
    mockEndpoints({ ...savedConfig, appriseUrl: '', enableApprise: false })
    renderPage()

    expect(await screen.findByText('Not configured')).toBeInTheDocument()
    expect(screen.getByText('Not set')).toBeInTheDocument()
    expect(screen.getByText('appriseUrl')).toBeInTheDocument()
    expect(
      screen.getByText('Set up an Apprise server to use these settings.'),
    ).toBeInTheDocument()
  })
})

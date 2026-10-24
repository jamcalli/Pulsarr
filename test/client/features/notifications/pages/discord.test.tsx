import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import DiscordPage from '@/features/notifications/pages/discord'
import { setFormatLocale } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { useProgressStore } from '@/stores/progressStore'
import { server } from '../../../setup.js'
import { stubViewport } from '../../../viewport.js'

const URL_A = 'https://discord.com/api/webhooks/1/a'
const ROW_ERROR =
  'Enter a Discord webhook URL starting https://discord.com/api/webhooks/.'

const savedConfig = {
  discordWebhookUrl: URL_A,
  discordBotToken: 'saved-token',
  discordClientId: '1294718263051948123',
}

const listedUsers = [
  {
    id: 7,
    name: 'riley',
    alias: 'Riley',
    discord_id: '284519736420163584',
  },
  { id: 8, name: 'sam', alias: null, discord_id: null },
]

function setBotStatus(status: string) {
  useProgressStore.setState({
    systemStatusCache: {
      'discord-status': {
        operationId: 'discord-status',
        type: 'system',
        phase: 'info',
        progress: 100,
        message: `Discord bot status: ${status}`,
        metadata: { status },
      },
    },
  })
}

function mockEndpoints(config: object = savedConfig) {
  const configBodies: unknown[] = []
  const dmBodies: unknown[] = []
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
    http.post('/v1/notifications/test/discord-dm', async ({ request }) => {
      dmBodies.push(await request.json())
      return HttpResponse.json({ success: true, responseTime: 642 })
    }),
  )
  return { configBodies, dmBodies }
}

function dmSendButton() {
  const [, dmButton] = screen.getAllByRole('button', { name: 'Send test' })
  if (!dmButton) throw new Error('missing the test message button')
  return dmButton
}

function renderPage() {
  const router = createMemoryRouter([{ path: '*', element: <DiscordPage /> }])
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('DiscordPage', () => {
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

  it('renders the saved webhooks and the running bot', async () => {
    setBotStatus('running')
    mockEndpoints()
    renderPage()

    expect(await screen.findByLabelText('Webhook URLs, URL 1')).toHaveValue(
      URL_A,
    )
    expect(screen.getByLabelText('Webhook URLs, URL 1')).toHaveAttribute(
      'type',
      'text',
    )
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stop bot' })).toBeEnabled()
    expect(screen.getByLabelText('Bot token')).toHaveValue('saved-token')
    expect(screen.getByLabelText('Client ID')).toHaveValue(
      '1294718263051948123',
    )
    expect(
      screen.getByRole('button', { name: 'Test saved URLs' }),
    ).toBeEnabled()
    expect(screen.getByRole('link', { name: 'Discord setup' })).toHaveAttribute(
      'href',
      'https://jamcalli.github.io/Pulsarr/docs/notifications/discord#user-notification-setup',
    )
  })

  it('sends a test direct message to a typed Discord ID', async () => {
    const user = userEvent.setup()
    setBotStatus('running')
    const { dmBodies } = mockEndpoints()
    renderPage()

    const id = await screen.findByLabelText('Send to')
    await user.type(id, '12345')
    await user.tab()
    expect(id).toHaveAccessibleDescription('Must be a numeric Discord user ID')
    expect(dmSendButton()).toBeDisabled()

    await user.clear(id)
    await user.type(id, '311852004712464384')
    await user.click(dmSendButton())

    expect(await screen.findByText('in 642 ms')).toBeInTheDocument()
    expect(dmBodies).toEqual([{ discordId: '311852004712464384' }])
  })

  it('sends a test direct message to a picked user', async () => {
    const user = userEvent.setup()
    setBotStatus('running')
    const { dmBodies } = mockEndpoints()
    renderPage()

    await user.click(await screen.findByLabelText('Send to'))
    expect(await screen.findByRole('option', { name: /Riley/ })).toBeVisible()
    expect(screen.queryByRole('option', { name: /sam/ })).toBeNull()
    await user.click(screen.getByRole('option', { name: /Riley/ }))
    await user.click(dmSendButton())

    expect(await screen.findByText('in 642 ms')).toBeInTheDocument()
    expect(dmBodies).toEqual([{ discordId: '284519736420163584' }])
  })

  it('clears a typed ID and a picked user', async () => {
    const user = userEvent.setup()
    setBotStatus('running')
    mockEndpoints()
    renderPage()

    const input = await screen.findByLabelText('Send to')
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
    await user.type(input, '311852004712464384')
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(input).toHaveValue('')

    await user.click(input)
    await user.click(await screen.findByRole('option', { name: /Riley/ }))
    expect(input).toHaveValue('Riley')
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(input).toHaveValue('')
    expect(dmSendButton()).toBeDisabled()
  })

  it('locks Start and the test message until the bot can run', async () => {
    setBotStatus('stopped')
    mockEndpoints({ discordWebhookUrl: '' })
    renderPage()

    expect(
      await screen.findByRole('button', { name: 'Start bot' }),
    ).toBeDisabled()
    expect(
      screen.getByText('Save a bot token and client ID first.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Start the bot to send direct messages.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Send to')).toBeDisabled()
  })

  it('warns that a running bot keeps its old token', async () => {
    const user = userEvent.setup()
    setBotStatus('starting')
    mockEndpoints()
    renderPage()

    expect(
      await screen.findByText('Wait for the bot to finish starting.'),
    ).toBeInTheDocument()
    await user.type(screen.getByLabelText('Bot token'), '-new')

    expect(
      screen.getByText(
        'The running bot keeps its old token until you restart it.',
      ),
    ).toBeInTheDocument()
  })

  it('blocks saving a malformed webhook with the row sentence', async () => {
    const user = userEvent.setup()
    setBotStatus('stopped')
    const { configBodies } = mockEndpoints()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Add URL' }))
    await user.type(
      screen.getByLabelText('Webhook URLs, URL 2'),
      'https://discord.com/api/webhook/2',
    )

    expect(screen.getByText(ROW_ERROR)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(configBodies).toEqual([])
  })

  it('saves an edited webhook list', async () => {
    const user = userEvent.setup()
    setBotStatus('stopped')
    const { configBodies } = mockEndpoints()
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: 'Remove URL 1' }),
    )
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Changes saved')).toBeInTheDocument()
    expect(configBodies).toEqual([{ ...savedConfig, discordWebhookUrl: '' }])
  })
})

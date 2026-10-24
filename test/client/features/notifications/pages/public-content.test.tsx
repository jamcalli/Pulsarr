import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import PublicContentPage from '@/features/notifications/pages/public-content'
import { setFormatLocale } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { useProgressStore } from '@/stores/progressStore'
import { server } from '../../../setup.js'
import { stubViewport } from '../../../viewport.js'

const DISCORD_URL = 'https://discord.com/api/webhooks/1/a'
const OFF_REASON = 'Turn on broadcast to use these lists.'
const APPRISE_REASON =
  'Apprise is disabled, so these lists do nothing until it is reachable.'

const lists = {
  enabled: true,
  discordWebhookUrls: DISCORD_URL,
  discordWebhookUrlsMovies: '',
  discordWebhookUrlsShows: '',
  appriseUrls: 'tgram://bot/chat',
  appriseUrlsMovies: '',
  appriseUrlsShows: '',
}

const savedConfig = {
  appriseUrl: 'http://apprise:8000',
  enableApprise: true,
  publicContentNotifications: lists,
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
  const router = createMemoryRouter([
    { path: '*', element: <PublicContentPage /> },
  ])
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

function section(title: string) {
  const heading = within(screen.getByRole('tabpanel')).getByText(title, {
    selector: '[data-slot=card-title]',
  })
  const card = heading.closest('[data-slot=card]')
  if (!(card instanceof HTMLElement)) throw new Error(`No card ${title}`)
  return within(card)
}

async function openTab(name: RegExp) {
  await userEvent.setup().click(await screen.findByRole('tab', { name }))
}

describe('PublicContentPage', () => {
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

  it('counts saved URLs per content type on the tabs', async () => {
    mockEndpoints({
      ...savedConfig,
      publicContentNotifications: {
        ...lists,
        discordWebhookUrlsMovies: `${DISCORD_URL},https://discord.com/api/webhooks/3/c`,
      },
    })
    renderPage()

    expect(
      await screen.findByRole('tab', { name: 'All content 2' }),
    ).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Movies 2' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Shows 0' })).toBeInTheDocument()
    expect(section('Discord webhooks').getByText('1 URL saved')).toBeVisible()
  })

  it('shows the override note and both lists on the Movies tab', async () => {
    mockEndpoints()
    renderPage()

    await openTab(/^Movies/)

    const panel = within(screen.getByRole('tabpanel'))
    expect(
      panel.getByText(
        'Movies without their own list use the All content lists.',
      ),
    ).toBeInTheDocument()
    expect(
      section('Discord webhooks').getByLabelText('Webhook URLs, URL 1'),
    ).toHaveValue('')
    expect(section('Discord webhooks').getByText('0 URLs saved')).toBeVisible()
    expect(
      section('Apprise').getByLabelText('Apprise URLs, URL 1'),
    ).toHaveAttribute('type', 'password')
    expect(section('Apprise').getByText('Enabled')).toBeVisible()
  })

  it('saves the whole object through the save bar', async () => {
    const user = userEvent.setup()
    const { configBodies } = mockEndpoints()
    renderPage()

    await openTab(/^Shows/)
    await user.type(
      section('Discord webhooks').getByLabelText('Webhook URLs, URL 1'),
      'https://discord.com/api/webhooks/2/b',
    )
    await openTab(/^All content/)
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Changes saved')).toBeInTheDocument()
    expect(configBodies).toEqual([
      {
        publicContentNotifications: {
          ...lists,
          discordWebhookUrlsShows: 'https://discord.com/api/webhooks/2/b',
        },
      },
    ])
  })

  it('masks the Apprise lists and keeps the Discord lists plain', async () => {
    mockEndpoints()
    renderPage()

    await screen.findByRole('tabpanel')
    expect(
      section('Discord webhooks').getByLabelText('Webhook URLs, URL 1'),
    ).toHaveAttribute('type', 'text')
    expect(
      section('Apprise').getByLabelText('Apprise URLs, URL 1'),
    ).toHaveAttribute('type', 'password')
  })

  it('locks both lists while off and unlocks them before save', async () => {
    const user = userEvent.setup()
    mockEndpoints({
      ...savedConfig,
      publicContentNotifications: { ...lists, enabled: false },
    })
    renderPage()

    await screen.findByRole('tabpanel')
    expect(
      section('Discord webhooks').getByText(OFF_REASON),
    ).toBeInTheDocument()
    expect(section('Apprise').getByText(OFF_REASON)).toBeInTheDocument()
    expect(
      section('Discord webhooks').getByLabelText('Webhook URLs, URL 1'),
    ).toBeDisabled()
    expect(
      section('Apprise').getByLabelText('Apprise URLs, URL 1'),
    ).toBeDisabled()

    await user.click(
      screen.getByRole('switch', { name: 'Broadcast to shared channels' }),
    )

    expect(screen.queryByText(OFF_REASON)).toBeNull()
    expect(
      section('Discord webhooks').getByLabelText('Webhook URLs, URL 1'),
    ).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
  })

  it('locks only the Apprise lists on every tab while Apprise is disabled', async () => {
    mockEndpoints({ ...savedConfig, enableApprise: false })
    renderPage()

    for (const tab of [/^All content/, /^Movies/, /^Shows/]) {
      await openTab(tab)
      const apprise = section('Apprise')
      expect(apprise.getByText(APPRISE_REASON)).toBeInTheDocument()
      expect(apprise.getByLabelText('Apprise URLs, URL 1')).toBeDisabled()
      expect(apprise.getByRole('button', { name: 'Apprise' })).toHaveAttribute(
        'href',
        '/notifications/apprise',
      )
      expect(
        section('Discord webhooks').getByLabelText('Webhook URLs, URL 1'),
      ).toBeEnabled()
    }
  })

  it('blocks save on a row that fails its channel check', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()

    await openTab(/^Movies/)
    await user.type(
      section('Discord webhooks').getByLabelText('Webhook URLs, URL 1'),
      'https://example.com/hook',
    )

    expect(
      screen.getByText(
        'Enter a Discord webhook URL starting https://discord.com/api/webhooks/.',
        { selector: 'span' },
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })
})

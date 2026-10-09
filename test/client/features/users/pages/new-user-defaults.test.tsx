import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import NewUserDefaultsPage from '@/features/users/pages/new-user-defaults'
import { setFormatLocale } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { server } from '../../../setup.js'
import { stubViewport } from '../../../viewport.js'

const savedConfig = {
  newUserDefaultCanSync: true,
  newUserDefaultRequiresApproval: false,
  newUserDefaultMovieQuotaEnabled: true,
  newUserDefaultMovieQuotaType: 'weekly_rolling',
  newUserDefaultMovieQuotaLimit: 5,
  newUserDefaultMovieBypassApproval: false,
  newUserDefaultMovieWatchlistCap: 50,
  newUserDefaultShowQuotaEnabled: true,
  newUserDefaultShowQuotaType: 'monthly',
  newUserDefaultShowQuotaLimit: 10,
  newUserDefaultShowBypassApproval: true,
  newUserDefaultShowWatchlistCap: null,
}

function mockEndpoints(config: Partial<typeof savedConfig> = {}) {
  const stored = { ...savedConfig, ...config }
  const configBodies: unknown[] = []
  server.use(
    http.get('/v1/config', () =>
      HttpResponse.json({ success: true, config: stored }),
    ),
    http.put('/v1/config', async ({ request }) => {
      const body = await request.json()
      configBodies.push(body)
      return HttpResponse.json({
        success: true,
        config: { ...stored, ...(body as object) },
      })
    }),
  )
  return { configBodies }
}

function renderPage() {
  const router = createMemoryRouter([
    { path: '*', element: <NewUserDefaultsPage /> },
  ])
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

async function findSection(title: string) {
  const heading = await screen.findByText(title, {
    selector: '[data-slot="card-title"]',
  })
  const card = heading.closest('[data-slot="card"]')
  if (!(card instanceof HTMLElement)) throw new Error(`No card for ${title}`)
  return within(card)
}

describe('NewUserDefaultsPage', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
    stubViewport({ mobile: false })
  })

  afterEach(() => {
    queryClient.clear()
    setFormatLocale(undefined)
    vi.unstubAllGlobals()
  })

  it('renders the saved defaults with a null cap switched off', async () => {
    mockEndpoints()
    renderPage()

    const access = await findSection('Access')
    expect(
      access.getByRole('switch', { name: 'Sync watchlists' }),
    ).toBeChecked()
    expect(
      access.getByRole('switch', { name: 'Require approval' }),
    ).not.toBeChecked()

    const movies = await findSection('Movies')
    expect(movies.getByRole('switch', { name: 'Limit requests' })).toBeChecked()
    expect(movies.getByLabelText('Quota period')).toHaveTextContent(
      'Weekly rolling',
    )
    expect(movies.getByLabelText('Requests per period')).toHaveValue('5')
    expect(
      movies.getByRole('switch', { name: 'Bypass approval over the limit' }),
    ).not.toBeChecked()
    expect(
      movies.getByRole('switch', { name: 'Cap the watchlist' }),
    ).toBeChecked()
    expect(movies.getByLabelText('Watchlist cap')).toHaveValue('50')

    const shows = await findSection('Shows')
    expect(shows.getByLabelText('Quota period')).toHaveTextContent('Monthly')
    expect(shows.getByLabelText('Requests per period')).toHaveValue('10')
    expect(
      shows.getByRole('switch', { name: 'Bypass approval over the limit' }),
    ).toBeChecked()
    expect(
      shows.getByRole('switch', { name: 'Cap the watchlist' }),
    ).not.toBeChecked()
    expect(shows.getByLabelText('Watchlist cap')).toBeDisabled()
  })

  it('saves every field, sending a cap switched off as null and one switched on as its number', async () => {
    const user = userEvent.setup()
    const { configBodies } = mockEndpoints()
    renderPage()

    const access = await findSection('Access')
    await user.click(access.getByRole('switch', { name: 'Require approval' }))
    const movies = await findSection('Movies')
    await user.click(movies.getByRole('switch', { name: 'Cap the watchlist' }))
    const shows = await findSection('Shows')
    await user.click(shows.getByRole('switch', { name: 'Cap the watchlist' }))
    const showCap = shows.getByLabelText('Watchlist cap')
    await user.clear(showCap)
    await user.type(showCap, '250')
    await user.click(shows.getByLabelText('Quota period'))
    await user.click(await screen.findByRole('option', { name: 'Daily' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Changes saved')).toBeInTheDocument()
    expect(configBodies).toEqual([
      {
        ...savedConfig,
        newUserDefaultRequiresApproval: true,
        newUserDefaultMovieWatchlistCap: null,
        newUserDefaultShowQuotaType: 'daily',
        newUserDefaultShowWatchlistCap: 250,
      },
    ])
  })

  it('offers the default cap when a null cap is switched on', async () => {
    const user = userEvent.setup()
    const { configBodies } = mockEndpoints()
    renderPage()

    const shows = await findSection('Shows')
    await user.click(shows.getByRole('switch', { name: 'Cap the watchlist' }))

    expect(shows.getByLabelText('Watchlist cap')).toHaveValue('100')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Changes saved')).toBeInTheDocument()
    expect(configBodies).toEqual([
      { ...savedConfig, newUserDefaultShowWatchlistCap: 100 },
    ])
  })

  it('disables the quota fields in place when the quota is off and the cap when its switch is off', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()

    const movies = await findSection('Movies')
    expect(movies.getByLabelText('Watchlist cap')).toBeEnabled()

    await user.click(movies.getByRole('switch', { name: 'Cap the watchlist' }))
    expect(movies.getByLabelText('Watchlist cap')).toBeDisabled()
    expect(movies.getByLabelText('Requests per period')).toBeEnabled()

    await user.click(movies.getByRole('switch', { name: 'Limit requests' }))
    expect(movies.getByLabelText('Quota period')).toBeDisabled()
    expect(movies.getByLabelText('Requests per period')).toBeDisabled()
    expect(
      movies.getByRole('switch', { name: 'Bypass approval over the limit' }),
    ).toHaveAttribute('aria-disabled', 'true')
    expect(
      movies.getByRole('switch', { name: 'Cap the watchlist' }),
    ).toHaveAttribute('aria-disabled', 'true')
    expect(movies.getByLabelText('Watchlist cap')).toBeDisabled()
  })

  it('blocks saving an empty limit and shows the field message', async () => {
    const user = userEvent.setup()
    const { configBodies } = mockEndpoints()
    renderPage()

    const movies = await findSection('Movies')
    const limit = movies.getByLabelText('Requests per period')
    await user.clear(limit)
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await movies.findByText('Enter a number of requests.'),
    ).toBeInTheDocument()
    expect(limit).toHaveAccessibleDescription('Enter a number of requests.')
    expect(configBodies).toEqual([])
  })

  it('blocks saving a switched-on cap left empty', async () => {
    const user = userEvent.setup()
    const { configBodies } = mockEndpoints()
    renderPage()

    const movies = await findSection('Movies')
    const cap = movies.getByLabelText('Watchlist cap')
    await user.clear(cap)
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(cap).toHaveAccessibleDescription('Enter a number of items.')
    expect(configBodies).toEqual([])
  })
})

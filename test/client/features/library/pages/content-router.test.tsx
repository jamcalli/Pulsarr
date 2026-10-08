import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import ContentRouterPage from '@/features/library/pages/content-router'
import { setFormatLocale } from '@/lib/format'
import { NAV_PAGES, pageHref } from '@/lib/navigation'
import { queryClient } from '@/lib/queryClient'
import type { components, paths } from '@/types/api.js'
import { server } from '../../../setup.js'
import { stubViewport } from '../../../viewport.js'
import { evaluators } from '../content-router-fixtures.js'

type RouterRule = components['schemas']['RouterRule']
type RouterRulePayload = components['schemas']['RouterRulePayload']
type RadarrInstance =
  paths['/v1/radarr/instances']['get']['responses'][200]['content']['application/json'][number]

function makeRule(overrides: Partial<RouterRule>): RouterRule {
  return {
    id: 1,
    name: 'Rule',
    target_type: 'radarr',
    target_instance_id: 1,
    quality_profile: 4,
    root_folder: '/movies',
    tags: [],
    order: 50,
    enabled: true,
    search_on_add: true,
    monitor: 'movieOnly',
    always_require_approval: false,
    bypass_user_quotas: false,
    exclude_from_routing: false,
    condition: {
      operator: 'AND',
      negate: false,
      conditions: [
        { field: 'genres', operator: 'in', value: ['Anime'], negate: false },
      ],
    },
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const savedRules: RouterRule[] = [
  makeRule({ id: 1, name: 'Low', order: 40 }),
  makeRule({
    id: 2,
    name: 'High',
    order: 90,
    condition: {
      operator: 'AND',
      negate: false,
      conditions: [
        {
          field: 'year',
          operator: 'between',
          value: { min: 2010, max: 2020 },
          negate: false,
        },
      ],
    },
  }),
  makeRule({
    id: 3,
    name: 'Anime shows',
    target_type: 'sonarr',
    monitor: undefined,
  }),
]

const radarrInstance: RadarrInstance = {
  id: 1,
  name: 'Radarr',
  baseUrl: 'http://radarr:7878',
  apiKey: 'real-key',
  qualityProfile: 4,
  rootFolder: '/movies',
  bypassIgnored: false,
  searchOnAdd: true,
  minimumAvailability: 'released',
  monitor: 'movieOnly',
  tags: [],
  isDefault: true,
  skipDefaultRoutingWhenNoMatch: false,
}

const instanceMeta = {
  success: true,
  instance: { id: 1, name: 'Radarr', baseUrl: 'http://radarr:7878' },
}

function mockEndpoints(rules: RouterRule[] = savedRules) {
  const bodies = {
    post: [] as unknown[],
    put: [] as unknown[],
    patch: [] as unknown[],
    deleted: [] as string[],
  }
  server.use(
    http.get('/v1/content-router/rules', () =>
      HttpResponse.json({ success: true, message: 'ok', rules }),
    ),
    http.get('/v1/content-router/plugins/metadata', () =>
      HttpResponse.json({ success: true, evaluators }),
    ),
    http.get('/v1/users/list', () =>
      HttpResponse.json({ success: true, message: 'ok', users: [] }),
    ),
    http.get('/v1/radarr/instances', () => HttpResponse.json([radarrInstance])),
    http.get('/v1/radarr/quality-profiles', () =>
      HttpResponse.json({
        ...instanceMeta,
        qualityProfiles: [{ id: 4, name: 'HD-1080p' }],
      }),
    ),
    http.get('/v1/radarr/root-folders', () =>
      HttpResponse.json({
        ...instanceMeta,
        rootFolders: [{ id: 1, path: '/movies' }],
      }),
    ),
    http.get('/v1/radarr/tags', () =>
      HttpResponse.json({ ...instanceMeta, tags: [] }),
    ),
    http.get('/v1/plex/genres', () =>
      HttpResponse.json({ success: true, genres: ['Anime', 'Drama'] }),
    ),
    http.get('/v1/tmdb/providers', () =>
      HttpResponse.json({
        success: true,
        message: 'ok',
        region: 'US',
        providers: [],
      }),
    ),
    http.get('/v1/config', () =>
      HttpResponse.json({
        success: true,
        config: { plexSessionMonitoring: { enabled: false } },
      }),
    ),
    http.post<never, RouterRulePayload>(
      '/v1/content-router/rules',
      async ({ request }) => {
        const body = await request.json()
        bodies.post.push(body)
        const { condition, ...fields } = body
        return HttpResponse.json(
          {
            success: true,
            message: 'ok',
            rule: makeRule({ ...fields, id: 10 }),
          },
          { status: 201 },
        )
      },
    ),
    http.put<{ id: string }, RouterRulePayload>(
      '/v1/content-router/rules/:id',
      async ({ request, params }) => {
        const body = await request.json()
        bodies.put.push(body)
        const { condition, ...fields } = body
        return HttpResponse.json({
          success: true,
          message: 'ok',
          rule: makeRule({ ...fields, id: Number(params.id) }),
        })
      },
    ),
    http.patch('/v1/content-router/rules/:id/toggle', async ({ request }) => {
      bodies.patch.push(await request.json())
      return HttpResponse.json({ success: true, message: 'ok' })
    }),
    http.delete('/v1/content-router/rules/:id', ({ params }) => {
      bodies.deleted.push(String(params.id))
      return HttpResponse.json({ success: true, message: 'ok' })
    }),
  )
  return bodies
}

function renderPage(initialEntry = '/') {
  const router = createMemoryRouter(
    [{ path: '*', element: <ContentRouterPage /> }],
    { initialEntries: [initialEntry] },
  )
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

function byTextContent(text: string) {
  return (_: string, element: Element | null) =>
    element?.textContent === text &&
    Array.from(element.children).every((child) => child.textContent !== text)
}

function cardButton(name: string) {
  return screen.getByRole('button', { name: new RegExp(`^${name}`) })
}

describe('ContentRouterPage', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
    stubViewport({ mobile: false })
  })

  afterEach(() => {
    queryClient.clear()
    setFormatLocale(undefined)
    vi.unstubAllGlobals()
  })

  it('lists the routes of the tab highest priority first', async () => {
    mockEndpoints()
    renderPage()

    const high = await screen.findByText('High')
    const low = screen.getByText('Low')
    expect(
      high.compareDocumentPosition(low) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.queryByText('Anime shows')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Movies/ })).toHaveTextContent('2')
    expect(screen.getByRole('tab', { name: /TV shows/ })).toHaveTextContent('1')
    expect(screen.getByText('Year is 2010 to 2020')).toBeInTheDocument()
    expect(screen.getByText(byTextContent('Priority90'))).toBeInTheDocument()
    expect(
      await screen.findAllByText(byTextContent('Radarr, HD-1080p, /movies')),
    ).toHaveLength(2)
    expect(
      screen.getByText(
        'Movies that no route matches go to Radarr, your default Radarr instance.',
      ),
    ).toBeInTheDocument()
  })

  it('opens the tab named in the search params and keeps the tab there', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    server.use(http.get('/v1/sonarr/instances', () => HttpResponse.json([])))
    const router = renderPage('/?type=sonarr')

    expect(await screen.findByText('Anime shows')).toBeInTheDocument()
    expect(screen.queryByText('High')).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /Movies/ }))

    expect(await screen.findByText('High')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?type=radarr')
  })

  it('marks a route that is off and one that skips matches', async () => {
    mockEndpoints([
      makeRule({ id: 1, name: 'Paused', enabled: false }),
      makeRule({
        id: 2,
        name: 'Skipped',
        exclude_from_routing: true,
        always_require_approval: true,
      }),
      makeRule({ id: 3, name: 'Gated', always_require_approval: true }),
    ])
    renderPage()

    expect(await screen.findByText('Off')).toBeInTheDocument()
    expect(
      screen.getByText(
        byTextContent('Not routed. Matching movies are skipped'),
      ),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Requires approval')).toHaveLength(1)
  })

  it('blocks adding a route until an instance is set up', async () => {
    mockEndpoints([])
    server.use(
      http.get('/v1/radarr/instances', () =>
        HttpResponse.json([{ ...radarrInstance, apiKey: 'placeholder' }]),
      ),
    )
    renderPage()

    expect(await screen.findByText('No Radarr instance')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add route' })).toBeDisabled()
    expect(screen.getByText('Set up Radarr').closest('a')).toHaveAttribute(
      'href',
      pageHref(NAV_PAGES.radarr),
    )
  })

  it('leaves the unconfigured instance out of the picker and the catch-all', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    server.use(
      http.get('/v1/radarr/instances', () =>
        HttpResponse.json([
          { ...radarrInstance, apiKey: 'placeholder' },
          { ...radarrInstance, id: 2, name: 'Radarr 4K', isDefault: false },
        ]),
      ),
    )
    renderPage()

    expect(
      await screen.findByText('No instance is set up yet.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add route' }))
    await user.click(await screen.findByLabelText('Instance'))
    expect(
      await screen.findByRole('option', { name: 'Radarr 4K' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('option', { name: /^Radarr( \(default\))?$/ }),
    ).not.toBeInTheDocument()
  })

  it('notes an inverted rule and drops the priority hint for a skip', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /^High/ }))
    expect(
      await screen.findByText('1 to 100. Higher runs first.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Not all conditions' }))
    expect(screen.getByRole('note')).toHaveTextContent(
      'Inverted. This route applies when the conditions below are not met.',
    )
    await user.click(screen.getByRole('button', { name: "Don't route" }))
    expect(
      screen.queryByText('1 to 100. Higher runs first.'),
    ).not.toBeInTheDocument()
  })

  it('turns a route off from the list without dirtying its editor', async () => {
    const user = userEvent.setup()
    const bodies = mockEndpoints()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /^High/ }))
    await user.click(screen.getByRole('switch', { name: 'Enabled, High' }))

    await waitFor(() => expect(bodies.patch).toEqual([{ enabled: false }]))
    expect(
      screen.getByRole('switch', { name: 'Enabled, High' }),
    ).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Save route' })).toBeDisabled()
  })

  it('turns a route back on and explains when the toggle request fails', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    server.use(
      http.patch('/v1/content-router/rules/:id/toggle', () =>
        HttpResponse.error(),
      ),
    )
    renderPage()

    const toggle = await screen.findByRole('switch', { name: 'Enabled, High' })
    await user.click(toggle)

    expect(
      await screen.findByText(
        'An unexpected error occurred. Please try again.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Enabled, High' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Enabled, High' })).toBeEnabled()
  })

  it('creates a route with one condition', async () => {
    const user = userEvent.setup()
    const bodies = mockEndpoints()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Add route' }))
    await user.type(await screen.findByLabelText('Route name'), 'Anime movies')
    await user.click(screen.getByLabelText('Field'))
    await user.click(await screen.findByRole('option', { name: 'Genres' }))
    await user.click(screen.getByLabelText('Values'))
    await user.click(await screen.findByRole('option', { name: 'Anime' }))
    await user.keyboard('{Escape}')
    expect(screen.getByLabelText('Quality profile')).toHaveTextContent(
      'Use instance default',
    )
    await user.click(screen.getByLabelText('Quality profile'))
    await user.click(await screen.findByRole('option', { name: 'HD-1080p' }))
    await user.click(screen.getByRole('button', { name: 'Create route' }))

    await waitFor(() => expect(bodies.post).toHaveLength(1))
    expect(bodies.post[0]).toEqual({
      name: 'Anime movies',
      target_type: 'radarr',
      target_instance_id: 1,
      quality_profile: 4,
      root_folder: null,
      tags: [],
      enabled: true,
      order: 50,
      condition: {
        operator: 'AND',
        negate: false,
        conditions: [
          { field: 'genres', operator: 'in', value: ['Anime'], negate: false },
        ],
      },
      search_on_add: null,
      monitor: null,
      always_require_approval: false,
      bypass_user_quotas: false,
      exclude_from_routing: false,
    })
    expect(
      await screen.findByRole('button', { name: /^Anime movies/ }),
    ).toHaveAttribute('aria-expanded', 'false')
  })

  it('saves an edited route with a full replace', async () => {
    const user = userEvent.setup()
    const bodies = mockEndpoints()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /^Low/ }))
    const name = await screen.findByLabelText('Route name')
    await user.clear(name)
    await user.type(name, 'Lower')
    await user.click(screen.getByRole('button', { name: 'Save route' }))

    await waitFor(() => expect(bodies.put).toHaveLength(1))
    expect(bodies.put[0]).toMatchObject({
      name: 'Lower',
      target_type: 'radarr',
      target_instance_id: 1,
      quality_profile: 4,
      root_folder: '/movies',
      enabled: true,
      order: 40,
      condition: {
        operator: 'AND',
        negate: false,
        conditions: [
          { field: 'genres', operator: 'in', value: ['Anime'], negate: false },
        ],
      },
      exclude_from_routing: false,
    })
  })

  it('round-trips a route that inherits from its instance', async () => {
    const user = userEvent.setup()
    const bodies = mockEndpoints([
      makeRule({
        id: 1,
        name: 'Inherit',
        quality_profile: null,
        root_folder: null,
        search_on_add: null,
        monitor: null,
      }),
    ])
    renderPage()

    expect(
      await screen.findByText(byTextContent('Radarr, HD-1080p, /movies')),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Inherit/ }))
    expect(await screen.findByLabelText('Quality profile')).toHaveTextContent(
      'Use instance default',
    )
    expect(screen.getByLabelText('Root folder')).toHaveTextContent(
      'Use instance default',
    )
    expect(screen.getByLabelText('Monitor')).toHaveTextContent(
      'Use instance default',
    )
    const searchOnAdd = screen.getByRole('group', { name: 'Search on add' })
    expect(
      within(searchOnAdd).getByRole('button', { name: 'Use instance default' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await user.type(screen.getByLabelText('Route name'), ' edited')
    await user.click(screen.getByRole('button', { name: 'Save route' }))

    await waitFor(() => expect(bodies.put).toHaveLength(1))
    expect(bodies.put[0]).toMatchObject({
      quality_profile: null,
      root_folder: null,
      tags: [],
      search_on_add: null,
      monitor: null,
    })
  })

  it('names the instance default when the instance has no value', async () => {
    mockEndpoints([makeRule({ id: 1, name: 'Bare', quality_profile: null })])
    server.use(
      http.get('/v1/radarr/instances', () =>
        HttpResponse.json([{ ...radarrInstance, qualityProfile: null }]),
      ),
    )
    renderPage()

    expect(
      await screen.findByText(
        byTextContent('Radarr, Instance default, /movies'),
      ),
    ).toBeInTheDocument()
  })

  it('resets the routing fields to inherit when switching instance', async () => {
    const user = userEvent.setup()
    const bodies = mockEndpoints([
      makeRule({ id: 1, name: 'Tagged', tags: ['3'], search_on_add: false }),
    ])
    server.use(
      http.get('/v1/radarr/instances', () =>
        HttpResponse.json([
          radarrInstance,
          { ...radarrInstance, id: 2, name: 'Radarr 4K', isDefault: false },
        ]),
      ),
      http.get('/v1/radarr/tags', () =>
        HttpResponse.json({
          ...instanceMeta,
          tags: [{ id: 3, label: 'anime' }],
        }),
      ),
    )
    renderPage()

    await user.click(await screen.findByRole('button', { name: /^Tagged/ }))
    await waitFor(() =>
      expect(screen.getByLabelText('Quality profile')).toHaveTextContent(
        'HD-1080p',
      ),
    )
    expect(
      screen.getByText(
        'Switching instance resets the fields below to its defaults.',
      ),
    ).toBeInTheDocument()
    await user.click(screen.getByLabelText('Instance'))
    await user.click(await screen.findByRole('option', { name: 'Radarr 4K' }))

    expect(screen.getByLabelText('Quality profile')).toHaveTextContent(
      'Use instance default',
    )
    expect(screen.getByLabelText('Root folder')).toHaveTextContent(
      'Use instance default',
    )
    expect(
      screen.queryByRole('button', { name: 'Remove anime' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save route' }))

    await waitFor(() => expect(bodies.put).toHaveLength(1))
    expect(bodies.put[0]).toMatchObject({
      target_instance_id: 2,
      quality_profile: null,
      root_folder: null,
      tags: [],
      search_on_add: null,
      monitor: null,
    })
  })

  it('describes each certification by its meaning and regions', async () => {
    const user = userEvent.setup()
    mockEndpoints([
      makeRule({
        id: 1,
        name: 'Family',
        condition: {
          operator: 'AND',
          negate: false,
          conditions: [
            {
              field: 'certification',
              operator: 'equals',
              value: 'PG',
              negate: false,
            },
          ],
        },
      }),
    ])
    renderPage()

    await user.click(await screen.findByRole('button', { name: /^Family/ }))
    await user.click(await screen.findByLabelText('Value'))
    const option = await screen.findByRole('option', {
      name: /^PG ?Parental guidance\./,
    })
    expect(option).toHaveTextContent(
      'Parental guidance. United States, United Kingdom, Canada, Australia, New Zealand',
    )
    expect(screen.getAllByRole('option')).toHaveLength(46)
  })

  it('offers a vote count on an IMDb list of ratings', async () => {
    const user = userEvent.setup()
    const bodies = mockEndpoints([
      makeRule({
        id: 1,
        name: 'Rated',
        condition: {
          operator: 'AND',
          negate: false,
          conditions: [
            {
              field: 'imdbRating',
              operator: 'in',
              value: [7, 8],
              negate: false,
            },
          ],
        },
      }),
    ])
    renderPage()

    await user.click(await screen.findByRole('button', { name: /^Rated/ }))
    await user.click(
      await screen.findByRole('button', { name: 'Add a minimum vote count' }),
    )
    await user.type(screen.getByLabelText('Minimum votes'), '5000')
    await user.click(screen.getByRole('button', { name: 'Save route' }))

    await waitFor(() => expect(bodies.put).toHaveLength(1))
    expect(bodies.put[0]).toMatchObject({
      condition: {
        conditions: [
          {
            field: 'imdbRating',
            operator: 'in',
            value: { rating: [7, 8], votes: 5000 },
          },
        ],
      },
    })
  })

  it('deletes a route after the confirm', async () => {
    const user = userEvent.setup()
    const bodies = mockEndpoints()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /^Low/ }))
    await user.click(
      await screen.findByRole('button', { name: 'Delete route' }),
    )
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Delete route?')).toBeInTheDocument()
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete route' }),
    )

    await waitFor(() => expect(bodies.deleted).toEqual(['1']))
    await waitFor(() =>
      expect(screen.queryByText('Low')).not.toBeInTheDocument(),
    )
  })

  it('shows the route schema message for an empty name', async () => {
    const user = userEvent.setup()
    const bodies = mockEndpoints()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Add route' }))
    await user.click(
      await screen.findByRole('button', { name: 'Create route' }),
    )

    expect(await screen.findByText('Name is required')).toBeInTheDocument()
    expect(
      screen.getByText('Condition must have field, operator, and value'),
    ).toBeInTheDocument()
    expect(bodies.post).toHaveLength(0)
  })

  it('asks before leaving a route with unsaved changes', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /^Low/ }))
    await user.type(await screen.findByLabelText('Route name'), ' edited')
    await user.click(cardButton('High'))

    expect(await screen.findByText('Leave without saving?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Leave' }))
    expect(
      await screen.findByRole('button', { name: 'Save route' }),
    ).toBeDisabled()
    expect(screen.getByLabelText('Route name')).toHaveValue('High')
  })

  it('adds a group inside a nested group', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /^High/ }))
    const addGroups = await screen.findAllByRole('button', {
      name: 'Add group',
    })
    await user.click(addGroups[0])
    const outer = screen.getByRole('group', {
      name: 'Condition group, level 1',
    })
    await user.click(within(outer).getByRole('button', { name: 'Add group' }))

    const inner = screen.getByRole('group', {
      name: 'Condition group, level 2',
    })
    expect(outer).toContainElement(inner)
    expect(within(inner).getAllByLabelText('Field')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Save route' })).toBeEnabled()
  })

  it('renders the editor on a phone', async () => {
    stubViewport({ mobile: true })
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /^High/ }))

    expect(await screen.findByLabelText('Field')).toBeInTheDocument()
    expect(screen.getByLabelText('Operator')).toBeInTheDocument()
    expect(screen.getByLabelText('From')).toHaveValue('2010')
    expect(screen.getByLabelText('To')).toHaveValue('2020')
  })
})

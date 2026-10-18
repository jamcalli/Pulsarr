import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import WebhooksPage from '@/features/notifications/pages/webhooks'
import { setFormatLocale } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import type { components } from '@/types/api.js'
import { server } from '../../../setup.js'
import { stubViewport } from '../../../viewport.js'

type Endpoint = components['schemas']['WebhookEndpoint']
type CreatePayload = components['schemas']['WebhookEndpointCreatePayload']
type UpdatePayload = components['schemas']['WebhookEndpointUpdatePayload']

const HOME: Endpoint = {
  id: 1,
  name: 'Home Assistant',
  url: 'https://ha.example.com/api/webhook/pulsarr',
  authHeaderName: null,
  authHeaderValue: null,
  eventTypes: ['watchlist.added', 'media.available'],
  enabled: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const N8N: Endpoint = {
  id: 2,
  name: 'n8n approvals',
  url: 'https://n8n.example.com/webhook/7c1e',
  authHeaderName: 'Authorization',
  authHeaderValue: 'Bearer secret',
  eventTypes: ['approval.created'],
  enabled: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const DESCRIPTIONS = [
  {
    type: 'media.available',
    description: 'When content becomes available to watch',
  },
  {
    type: 'approval.created',
    description: 'When a new approval request is submitted',
  },
]

function mockEndpoints(initial: Endpoint[] = [HOME, N8N]) {
  let endpoints = [...initial]
  const calls = {
    lists: 0,
    created: [] as CreatePayload[],
    updated: [] as { id: string; body: UpdatePayload }[],
    deleted: [] as string[],
    tested: [] as string[],
    testedUrls: [] as unknown[],
  }
  server.use(
    http.get('/v1/webhooks/endpoints', () => {
      calls.lists += 1
      return HttpResponse.json({ success: true, data: endpoints })
    }),
    http.get('/v1/webhooks/event-types', () =>
      HttpResponse.json({ success: true, data: DESCRIPTIONS }),
    ),
    http.post<never, CreatePayload>(
      '/v1/webhooks/endpoints',
      async ({ request }) => {
        const body = await request.json()
        calls.created.push(body)
        const created: Endpoint = {
          ...HOME,
          id: 3,
          authHeaderName: null,
          authHeaderValue: null,
          enabled: true,
          ...body,
        }
        endpoints = [...endpoints, created]
        return HttpResponse.json(
          { success: true, data: created },
          { status: 201 },
        )
      },
    ),
    http.put<{ id: string }, UpdatePayload>(
      '/v1/webhooks/endpoints/:id',
      async ({ params, request }) => {
        const body = await request.json()
        calls.updated.push({ id: params.id, body })
        endpoints = endpoints.map((endpoint) =>
          String(endpoint.id) === params.id
            ? {
                ...endpoint,
                ...body,
                authHeaderName:
                  body.authHeaderName === undefined
                    ? endpoint.authHeaderName
                    : body.authHeaderName,
                authHeaderValue:
                  body.authHeaderValue === undefined
                    ? endpoint.authHeaderValue
                    : body.authHeaderValue,
                updatedAt: '2026-02-01T00:00:00Z',
              }
            : endpoint,
        )
        const updated = endpoints.find((e) => String(e.id) === params.id)
        return HttpResponse.json({ success: true, data: updated })
      },
    ),
    http.delete<{ id: string }>('/v1/webhooks/endpoints/:id', ({ params }) => {
      calls.deleted.push(params.id)
      endpoints = endpoints.filter((e) => String(e.id) !== params.id)
      return HttpResponse.json({ success: true, message: 'deleted' })
    }),
    http.post('/v1/webhooks/endpoints/test', async ({ request }) => {
      calls.testedUrls.push(await request.json())
      return HttpResponse.json({
        success: true,
        statusCode: 200,
        responseTime: 311,
      })
    }),
    http.post<{ id: string }>(
      '/v1/webhooks/endpoints/:id/test',
      ({ params }) => {
        calls.tested.push(params.id)
        return HttpResponse.json({
          success: false,
          error: 'Request timed out after 10 seconds',
          responseTime: 10000,
        })
      },
    ),
  )
  return calls
}

function renderPage() {
  const router = createMemoryRouter([{ path: '*', element: <WebhooksPage /> }])
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

function findList() {
  return screen.findByRole('list', { name: 'Webhook endpoints' })
}

function endpointRow(name: string) {
  const list = screen.getByRole('list', { name: 'Webhook endpoints' })
  const row = within(list)
    .getAllByRole('listitem')
    .find((item) => within(item).queryByText(name) !== null)
  if (!row) throw new Error(`No row for ${name}`)
  return within(row)
}

async function openEditor(name: string) {
  const user = userEvent.setup()
  await user.click(endpointRow(name).getByRole('button', { name: 'Edit' }))
  const dialog = await screen.findByRole('dialog', { name: `Edit ${name}` })
  return { user, dialog: within(dialog) }
}

describe('WebhooksPage', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
    stubViewport({ mobile: false })
  })

  afterEach(() => {
    queryClient.clear()
    setFormatLocale(undefined)
    vi.unstubAllGlobals()
  })

  it('shows the empty state with one way in', async () => {
    mockEndpoints([])
    renderPage()

    expect(await screen.findByText('No endpoints yet')).toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: 'Add endpoint' }),
    ).toHaveLength(1)
    expect(
      screen.getAllByRole('link', { name: 'Webhook payloads' }),
    ).toHaveLength(1)
    const empty = screen
      .getByText('No endpoints yet')
      .closest('[data-slot="empty"]')
    expect(
      within(empty as HTMLElement).getByRole('link', {
        name: 'Webhook payloads',
      }),
    ).toHaveAttribute(
      'href',
      'https://jamcalli.github.io/Pulsarr/docs/api/webhook-payloads',
    )
  })

  it('opens the editor from the empty state', async () => {
    const user = userEvent.setup()
    mockEndpoints([])
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: 'Add endpoint' }),
    )

    expect(
      await screen.findByRole('dialog', { name: 'Add endpoint' }),
    ).toBeInTheDocument()
  })

  it('puts Add endpoint in the header once endpoints exist', async () => {
    mockEndpoints()
    renderPage()
    const list = await findList()

    const add = screen.getByRole('button', { name: 'Add endpoint' })
    const headerRow = screen.getByRole('heading', { name: 'Webhooks' })
      .parentElement?.parentElement
    expect(headerRow).toContainElement(add)
    expect(list).not.toContainElement(add)
    expect(
      within(headerRow as HTMLElement).queryByRole('link', {
        name: 'Webhook payloads',
      }),
    ).toBeNull()
  })

  it('links the webhook payloads docs inside the list card', async () => {
    mockEndpoints()
    renderPage()
    const list = await findList()

    expect(
      screen.getAllByRole('link', { name: 'Webhook payloads' }),
    ).toHaveLength(1)
    const card = list.closest('[data-slot="card"]')
    expect(
      within(card as HTMLElement).getByRole('link', {
        name: 'Webhook payloads',
      }),
    ).toHaveAttribute(
      'href',
      'https://jamcalli.github.io/Pulsarr/docs/api/webhook-payloads',
    )
  })

  it('titles the list card with the endpoint count', async () => {
    mockEndpoints()
    renderPage()
    const list = await findList()

    const card = list.closest('[data-slot="card"]')
    const title = card?.querySelector('[data-slot="card-title"]')
    expect(title).toHaveTextContent(/^Endpoints2$/)
    expect(within(title as HTMLElement).getByText('2')).toBeInTheDocument()
    expect(
      endpointRow('Home Assistant').getByRole('switch', {
        name: 'Home Assistant enabled',
      }),
    ).toBeInTheDocument()
  })

  it('lists endpoints with the header name and event labels', async () => {
    mockEndpoints()
    renderPage()
    await findList()

    const home = endpointRow('Home Assistant')
    expect(home.getByText(HOME.url)).toBeInTheDocument()
    expect(
      home
        .getAllByText(/^(Media available|Watchlist added)$/)
        .map((badge) => badge.textContent),
    ).toEqual(['Media available', 'Watchlist added'])
    expect(home.queryByText(/Auth header/)).toBeNull()
    const n8n = endpointRow('n8n approvals')
    expect(n8n.getByText('Auth header Authorization')).toBeInTheDocument()
    expect(n8n.queryByText('Bearer secret')).toBeNull()
  })

  it('writes enabled right away from the row switch', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    renderPage()
    await findList()

    const toggle = endpointRow('Home Assistant').getByRole('switch', {
      name: 'Home Assistant enabled',
    })
    await user.click(toggle)

    await waitFor(() =>
      expect(calls.updated).toEqual([{ id: '1', body: { enabled: false } }]),
    )
    await waitFor(() => expect(toggle).not.toBeChecked())
  })

  it('shows a failed switch under its row', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    server.use(
      http.put('/v1/webhooks/endpoints/:id', () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    )
    renderPage()
    await findList()

    await user.click(
      endpointRow('Home Assistant').getByRole('switch', {
        name: 'Home Assistant enabled',
      }),
    )

    expect(
      await endpointRow('Home Assistant').findByText(
        'The endpoint could not be turned off. Try again.',
      ),
    ).toBeInTheDocument()
  })

  it('keeps each switch pending on its own while writes overlap', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.put<{ id: string }>(
        '/v1/webhooks/endpoints/:id',
        async ({ params, request }) => {
          await held
          const body = (await request.json()) as UpdatePayload
          calls.updated.push({ id: params.id, body })
          const saved = params.id === '1' ? HOME : N8N
          return HttpResponse.json({
            success: true,
            data: { ...saved, ...body },
          })
        },
      ),
    )
    renderPage()
    await findList()
    const home = endpointRow('Home Assistant').getByRole('switch', {
      name: 'Home Assistant enabled',
    })
    const n8n = endpointRow('n8n approvals').getByRole('switch', {
      name: 'n8n approvals enabled',
    })

    await user.click(home)
    await user.click(n8n)

    expect(home).toHaveAttribute('aria-disabled', 'true')
    expect(n8n).toHaveAttribute('aria-disabled', 'true')
    expect(home).not.toBeChecked()
    expect(n8n).not.toBeChecked()

    release()
    await waitFor(() =>
      expect(
        [...calls.updated].sort((a, b) => a.id.localeCompare(b.id)),
      ).toEqual([
        { id: '1', body: { enabled: false } },
        { id: '2', body: { enabled: false } },
      ]),
    )
    await waitFor(() =>
      expect(home).not.toHaveAttribute('aria-disabled', 'true'),
    )
    expect(n8n).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('rolls back a failed switch and shows the error on that row only', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    server.use(
      http.put('/v1/webhooks/endpoints/1', () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    )
    renderPage()
    await findList()
    const home = endpointRow('Home Assistant').getByRole('switch', {
      name: 'Home Assistant enabled',
    })

    await user.click(home)

    expect(
      await endpointRow('Home Assistant').findByText(
        'The endpoint could not be turned off. Try again.',
      ),
    ).toBeInTheDocument()
    await waitFor(() => expect(home).toBeChecked())
    expect(
      endpointRow('n8n approvals').queryByText(/could not be turned/),
    ).toBeNull()
  })

  it('tests a saved endpoint and shows the result under its row', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    renderPage()
    await findList()

    await user.click(
      endpointRow('n8n approvals').getByRole('button', { name: 'Send test' }),
    )

    expect(
      await endpointRow('n8n approvals').findByText(
        'Request timed out after 10 seconds',
      ),
    ).toBeInTheDocument()
    expect(calls.tested).toEqual(['2'])
  })

  it('deletes an endpoint through the confirm naming its events', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    renderPage()
    await findList()

    await user.click(
      endpointRow('Home Assistant').getByRole('button', { name: 'Delete' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Delete Home Assistant?',
    })
    expect(dialog).toHaveAccessibleDescription(
      "Home Assistant stops receiving Media available, Watchlist added. You can't undo this.",
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete endpoint' }),
    )

    await waitFor(() => expect(screen.queryByText('Home Assistant')).toBeNull())
    expect(calls.deleted).toEqual(['1'])
  })

  it('adds an endpoint once the form is touched', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints([HOME])
    renderPage()
    await findList()

    await user.click(screen.getByRole('button', { name: 'Add endpoint' }))
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Add endpoint' }),
    )
    expect(dialog.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(dialog.queryByRole('button', { name: 'Add endpoint' })).toBeNull()
    expect(
      within(dialog.getByRole('group', { name: 'Events' })).queryByRole(
        'link',
        { name: 'Webhook payloads' },
      ),
    ).toBeNull()

    await user.type(dialog.getByLabelText('Name'), 'n8n')
    expect(
      await dialog.findByText('When content becomes available to watch'),
    ).toBeInTheDocument()
    expect(dialog.getByText('Pick at least one event.')).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Add endpoint' })).toBeDisabled()

    await user.type(dialog.getByLabelText('URL'), 'https://n8n.example.com/h')
    await user.click(dialog.getByRole('button', { name: 'Send test' }))
    expect(await dialog.findByText('HTTP 200, in 311 ms')).toBeInTheDocument()
    expect(calls.testedUrls).toEqual([{ url: 'https://n8n.example.com/h' }])

    await user.click(dialog.getByRole('checkbox', { name: 'Approval created' }))
    await user.click(dialog.getByRole('button', { name: 'Add endpoint' }))

    await waitFor(() =>
      expect(calls.created).toEqual([
        {
          name: 'n8n',
          url: 'https://n8n.example.com/h',
          eventTypes: ['approval.created'],
          enabled: true,
        },
      ]),
    )
    expect(
      await endpointRow('n8n').findByText('Approval created'),
    ).toBeVisible()
    expect(calls.lists).toBe(2)
  })

  it('needs both header parts or neither', async () => {
    const user = userEvent.setup()
    mockEndpoints([HOME])
    renderPage()
    await findList()

    const { dialog } = await openEditor('Home Assistant')
    await user.type(dialog.getByLabelText('Header value'), 'Bearer x')

    expect(dialog.getByText('Add a header name.')).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Save changes' })).toBeDisabled()

    await user.type(dialog.getByLabelText('Header name'), 'Authorization')
    await user.clear(dialog.getByLabelText('Header value'))

    expect(dialog.getAllByText('Add a header value.')).toHaveLength(2)
    expect(dialog.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('opens edit with the saved values and sends null headers once cleared', async () => {
    const calls = mockEndpoints()
    renderPage()
    await findList()
    const home = await openEditor('Home Assistant')
    expect(home.dialog.getByLabelText('Name')).toHaveValue(HOME.name)
    await home.user.click(home.dialog.getByRole('button', { name: 'Cancel' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Edit Home Assistant' }),
      ).toBeNull(),
    )

    const { user, dialog } = await openEditor('n8n approvals')
    expect(dialog.getByLabelText('Name')).toHaveValue(N8N.name)
    expect(dialog.getByLabelText('Header name')).toHaveValue('Authorization')
    expect(dialog.getByLabelText('Header value')).toHaveAttribute(
      'type',
      'password',
    )
    expect(
      dialog.getByRole('checkbox', { name: 'Approval created' }),
    ).toBeChecked()
    expect(dialog.queryByRole('button', { name: 'Save changes' })).toBeNull()

    await user.clear(dialog.getByLabelText('Header name'))
    await user.clear(dialog.getByLabelText('Header value'))
    await user.click(dialog.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(calls.updated).toEqual([
        { id: '2', body: { authHeaderName: null, authHeaderValue: null } },
      ]),
    )
  })

  it('asks before closing a dirty editor and closes a clean one', async () => {
    mockEndpoints()
    renderPage()
    await findList()

    const first = await openEditor('Home Assistant')
    await first.user.click(first.dialog.getByRole('button', { name: 'Cancel' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Edit Home Assistant' }),
      ).toBeNull(),
    )
    expect(
      screen.queryByRole('dialog', { name: 'Leave without saving?' }),
    ).toBeNull()

    const { user, dialog } = await openEditor('Home Assistant')
    await user.type(dialog.getByLabelText('Name'), ' 2')
    await user.keyboard('{Escape}')

    expect(
      await screen.findByRole('dialog', { name: 'Leave without saving?' }),
    ).toBeInTheDocument()
  })

  it('shows the retry alert on a list error', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/v1/webhooks/endpoints', () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    )
    renderPage()

    expect(
      await screen.findByRole('alert', {}, { timeout: 3000 }),
    ).toBeInTheDocument()
    mockEndpoints()
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await findList()).toBeInTheDocument()
  })

  it('shows the skeleton while the list is loading', async () => {
    server.use(http.get('/v1/webhooks/endpoints', () => delay('infinite')))
    renderPage()

    await waitFor(() =>
      expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument(),
    )
    expect(
      screen.queryByRole('heading', { name: 'Webhooks' }),
    ).not.toBeInTheDocument()
  })
})

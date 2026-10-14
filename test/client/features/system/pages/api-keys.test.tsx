import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import ApiKeysPage from '@/features/system/pages/api-keys'
import { setFormatLocale } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { useProgressStore } from '@/stores/progressStore'
import type { paths } from '@/types/api.js'
import { server } from '../../../setup.js'
import { stubViewport } from '../../../viewport.js'

type ApiKey =
  paths['/v1/api-keys/']['get']['responses'][200]['content']['application/json']['apiKeys'][number]
type CreatePayload =
  paths['/v1/api-keys/']['post']['requestBody']['content']['application/json']

function apiKey(overrides: Pick<ApiKey, 'id' | 'name' | 'key'>): ApiKey {
  return {
    user_id: 1,
    created_at: '2026-01-01T00:00:00Z',
    is_active: true,
    ...overrides,
  }
}

const savedKeys: ApiKey[] = [
  apiKey({ id: 2, name: 'Overseerr', key: 'key-overseerr' }),
  apiKey({ id: 1, name: 'Scripts', key: 'key-scripts' }),
]

function mockKeys(initial: ApiKey[] = savedKeys) {
  let keys = [...initial]
  const calls = {
    lists: 0,
    created: [] as CreatePayload[],
    revoked: [] as string[],
  }
  server.use(
    http.get('/v1/api-keys/', () => {
      calls.lists += 1
      return HttpResponse.json({ success: true, message: 'ok', apiKeys: keys })
    }),
    http.post<never, CreatePayload>('/v1/api-keys/', async ({ request }) => {
      const body = await request.json()
      calls.created.push(body)
      const created = apiKey({ id: 3, name: body.name, key: 'key-new' })
      keys = [created, ...keys]
      return HttpResponse.json(
        { success: true, message: 'ok', apiKey: created },
        { status: 201 },
      )
    }),
    http.delete<{ id: string }>('/v1/api-keys/:id', ({ params }) => {
      calls.revoked.push(params.id)
      keys = keys.filter((key) => String(key.id) !== params.id)
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return calls
}

function renderPage() {
  const router = createMemoryRouter([{ path: '*', element: <ApiKeysPage /> }])
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

async function findKeyList() {
  return screen.findByRole('list', { name: 'API keys' })
}

function keyRow(name: string) {
  const list = screen.getByRole('list', { name: 'API keys' })
  const row = within(list)
    .getAllByRole('listitem')
    .find((item) => within(item).queryByText(name) !== null)
  if (!row) throw new Error(`No row for ${name}`)
  return within(row)
}

describe('ApiKeysPage', () => {
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

  it('lists keys newest first with the key masked', async () => {
    mockKeys()
    renderPage()

    const list = await findKeyList()
    const names = within(list)
      .getAllByRole('listitem')
      .map(
        (item) => within(item).getByText(/^(Overseerr|Scripts)$/).textContent,
      )
    expect(names).toEqual(['Overseerr', 'Scripts'])
    expect(screen.getByLabelText('Key for Overseerr')).toHaveAttribute(
      'type',
      'password',
    )
  })

  it('reveals a key', async () => {
    const user = userEvent.setup()
    mockKeys()
    renderPage()
    await findKeyList()

    await user.click(
      keyRow('Overseerr').getByRole('button', { name: 'Show key' }),
    )

    const input = screen.getByLabelText('Key for Overseerr')
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveValue('key-overseerr')
    expect(screen.getByLabelText('Key for Scripts')).toHaveAttribute(
      'type',
      'password',
    )
  })

  it('copies a key', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('isSecureContext', true)
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined)
    mockKeys()
    renderPage()
    await findKeyList()

    await user.click(
      keyRow('Scripts').getByRole('button', { name: 'Copy key' }),
    )

    expect(writeText).toHaveBeenCalledWith('key-scripts')
  })

  it('creates a key and refetches the list', async () => {
    const user = userEvent.setup()
    const calls = mockKeys()
    renderPage()
    await findKeyList()

    await user.type(screen.getByLabelText('Name'), 'Home Assistant')
    await user.click(screen.getByRole('button', { name: 'Create key' }))

    expect(
      await screen.findByLabelText('Key for Home Assistant'),
    ).toBeInTheDocument()
    expect(calls.created).toEqual([{ name: 'Home Assistant' }])
    expect(calls.lists).toBe(2)
    expect(screen.getByLabelText('Name')).toHaveValue('')
  })

  it('rejects an empty name without a request', async () => {
    const user = userEvent.setup()
    const calls = mockKeys()
    renderPage()
    await findKeyList()

    await user.click(screen.getByRole('button', { name: 'Create key' }))

    expect(await screen.findByText('Name is required')).toBeInTheDocument()
    expect(calls.created).toEqual([])
  })

  it('shows a failed create', async () => {
    const user = userEvent.setup()
    mockKeys()
    server.use(
      http.post('/v1/api-keys/', () => HttpResponse.json({}, { status: 500 })),
    )
    renderPage()
    await findKeyList()

    await user.type(screen.getByLabelText('Name'), 'Home Assistant')
    await user.click(screen.getByRole('button', { name: 'Create key' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The key was not created. Try again.',
    )
  })

  it('revokes a key through the confirm', async () => {
    const user = userEvent.setup()
    const calls = mockKeys()
    renderPage()
    await findKeyList()

    await user.click(keyRow('Scripts').getByRole('button', { name: 'Revoke' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Revoke Scripts?',
    })
    await user.click(within(dialog).getByRole('button', { name: 'Revoke key' }))

    await waitFor(() =>
      expect(
        screen.queryByLabelText('Key for Scripts'),
      ).not.toBeInTheDocument(),
    )
    expect(calls.revoked).toEqual(['1'])
    expect(screen.getByLabelText('Key for Overseerr')).toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Revoke Scripts?' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('shows a failed revoke in the confirm', async () => {
    const user = userEvent.setup()
    mockKeys()
    server.use(
      http.delete('/v1/api-keys/:id', () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    )
    renderPage()
    await findKeyList()

    await user.click(keyRow('Scripts').getByRole('button', { name: 'Revoke' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Revoke Scripts?',
    })
    await user.click(within(dialog).getByRole('button', { name: 'Revoke key' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'The key was not revoked. Try again.',
    )
  })

  it('shows the empty state', async () => {
    mockKeys([])
    renderPage()

    expect(await screen.findByText('No API keys yet')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'API keys' })).toBeNull()
  })

  it('shows the retry alert on a list error', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/v1/api-keys/', () => HttpResponse.json({}, { status: 500 })),
    )
    renderPage()

    expect(
      await screen.findByRole('alert', {}, { timeout: 3000 }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'API keys' }),
    ).toBeInTheDocument()
    mockKeys()
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await findKeyList()).toBeInTheDocument()
  })

  it('shows the skeleton while the list is loading', async () => {
    server.use(http.get('/v1/api-keys/', () => delay('infinite')))
    renderPage()

    await waitFor(() =>
      expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument(),
    )
    expect(
      screen.queryByRole('heading', { name: 'API keys' }),
    ).not.toBeInTheDocument()
  })
})

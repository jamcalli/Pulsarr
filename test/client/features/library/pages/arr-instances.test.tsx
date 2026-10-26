import { placeholderSonarrInstance } from '@root/schemas/common/arr-placeholder'
import type { ProgressEvent } from '@root/types/progress.types'
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import ArrInstancesPage from '@/features/library/pages/arr-instances'
import { setFormatLocale } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { useProgressStore } from '@/stores/progressStore'
import type { components } from '@/types/api.js'
import { server } from '../../../setup.js'
import { stubViewport } from '../../../viewport.js'

type SonarrInstance = components['schemas']['SonarrInstance']
type TestResponse = components['schemas']['ArrTestConnectionResponse']
type ArrInstanceConflict = components['schemas']['ArrInstanceConflict']
type ResyncRow = {
  instanceId: number
  name: string
  success: boolean
  message: string
}

function makeInstance(overrides: Partial<SonarrInstance>): SonarrInstance {
  return {
    id: 1,
    name: 'Sonarr',
    baseUrl: 'http://192.168.1.20:8989',
    apiKey: 'key-1',
    qualityProfile: 4,
    rootFolder: '/data/tv',
    bypassIgnored: false,
    seasonMonitoring: 'all',
    monitorNewItems: 'all',
    searchOnAdd: true,
    createSeasonFolders: false,
    tags: [],
    isDefault: true,
    syncedInstances: [2],
    seriesType: 'standard',
    skipDefaultRoutingWhenNoMatch: false,
    ...overrides,
  }
}

const main = makeInstance({})
const fourK = makeInstance({
  id: 2,
  name: 'Sonarr 4K',
  baseUrl: 'http://192.168.1.20:8990',
  apiKey: 'key-2',
  qualityProfile: 5,
  rootFolder: '/data/tv-4k',
  isDefault: false,
  syncedInstances: [],
})
const placeholder = makeInstance({
  ...placeholderSonarrInstance(),
  id: 7,
})

const NEW_URL = 'http://192.168.1.30:8990'
const PASSED: TestResponse = {
  success: true,
  message: 'Connection successful',
  code: null,
}

const instanceMeta = {
  success: true,
  instance: { id: 1, name: 'Sonarr', baseUrl: main.baseUrl },
}
const qualityProfiles = [
  { id: 4, name: 'HD-1080p' },
  { id: 5, name: 'Ultra-HD' },
]
const rootFolders = [
  { id: 1, path: '/data/tv' },
  { id: 2, path: '/data/tv-4k' },
]

interface MockOptions {
  instances?: SonarrInstance[]
  callbackBroken?: boolean
  conflictOnSave?: boolean
  resync?: { radarr: ResyncRow[]; sonarr: ResyncRow[] }
  syncGate?: Promise<void>
}

function mockEndpoints({
  instances = [fourK, main],
  callbackBroken = false,
  conflictOnSave = false,
  resync = { radarr: [], sonarr: [] },
  syncGate = Promise.resolve(),
}: MockOptions = {}) {
  const state = { instances: [...instances], callbackBroken }
  const calls = {
    tests: [] as Array<{ baseUrl: string; apiKey: string }>,
    post: [] as unknown[],
    put: [] as Array<{ id: string; body: unknown }>,
    deleted: [] as string[],
    config: [] as unknown[],
    syncs: [] as string[],
  }
  server.use(
    http.get('/v1/sonarr/instances', () => HttpResponse.json(state.instances)),
    http.get('/v1/config', () =>
      HttpResponse.json({
        success: true,
        config: {
          baseUrl: 'http://pulsarr',
          port: 3003,
          plexSessionMonitoring: { enabled: false },
        },
      }),
    ),
    http.put<never, Record<string, unknown>>(
      '/v1/config',
      async ({ request }) => {
        const body = await request.json()
        calls.config.push(body)
        const addressChanged = 'baseUrl' in body || 'port' in body
        if (addressChanged) state.callbackBroken = false
        return HttpResponse.json({
          success: true,
          config: body,
          ...(addressChanged ? { webhooks: resync } : {}),
        })
      },
    ),
    http.post<never, { baseUrl: string; apiKey: string }>(
      '/v1/sonarr/test-connection',
      async ({ request }) => {
        const body = await request.json()
        calls.tests.push(body)
        return HttpResponse.json<TestResponse>(
          state.callbackBroken
            ? {
                success: false,
                message: 'Unable to post to webhook',
                code: 'webhook_callback_failed',
              }
            : PASSED,
        )
      },
    ),
    http.post('/v1/sonarr/probe', () =>
      HttpResponse.json({
        success: true,
        qualityProfiles,
        rootFolders,
        tags: [],
      }),
    ),
    http.get('/v1/sonarr/quality-profiles', () =>
      HttpResponse.json({ ...instanceMeta, qualityProfiles }),
    ),
    http.get('/v1/sonarr/root-folders', () =>
      HttpResponse.json({ ...instanceMeta, rootFolders }),
    ),
    http.get('/v1/sonarr/tags', () =>
      HttpResponse.json({ ...instanceMeta, tags: [] }),
    ),
    http.post<never, SonarrInstance>(
      '/v1/sonarr/instances',
      async ({ request }) => {
        const body = await request.json()
        calls.post.push(body)
        state.instances = [...state.instances, { ...body, id: 3 }]
        return HttpResponse.json({ id: 3 }, { status: 201 })
      },
    ),
    http.put<{ id: string }, Partial<SonarrInstance>>(
      '/v1/sonarr/instances/:id',
      async ({ request, params }) => {
        const body = await request.json()
        calls.put.push({ id: params.id, body })
        if (conflictOnSave && state.callbackBroken) {
          return HttpResponse.json<ArrInstanceConflict>(
            {
              statusCode: 409,
              error: 'Conflict',
              message: 'Unable to post to webhook',
              code: 'webhook_callback_failed',
            },
            { status: 409 },
          )
        }
        state.instances = state.instances.map((instance) =>
          String(instance.id) === params.id
            ? { ...instance, ...body }
            : instance,
        )
        return new HttpResponse(null, { status: 204 })
      },
    ),
    http.delete<{ id: string }>('/v1/sonarr/instances/:id', ({ params }) => {
      calls.deleted.push(params.id)
      state.instances = state.instances.filter(
        (instance) => String(instance.id) !== params.id,
      )
      return new HttpResponse(null, { status: 204 })
    }),
    http.get('/v1/content-router/rules', () =>
      HttpResponse.json({
        success: true,
        message: 'ok',
        rules: [2, 2, 1].map((target, index) => ({
          id: index + 1,
          name: `Rule ${index + 1}`,
          target_type: 'sonarr',
          target_instance_id: target,
          condition: { operator: 'AND', negate: false, conditions: [] },
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        })),
      }),
    ),
    http.post<{ instanceId: string }>(
      '/v1/sync/instance/:instanceId',
      async ({ params }) => {
        calls.syncs.push(params.instanceId)
        await syncGate
        return HttpResponse.json({
          itemsCopied: 3,
          message: 'Copied 3 shows to Sonarr 4K',
        })
      },
    ),
  )
  return calls
}

function renderPage() {
  const router = createMemoryRouter([
    { path: '*', element: <ArrInstancesPage type="sonarr" /> },
  ])
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

function saveButton(name: string) {
  const button = screen
    .getAllByRole('button', { name })
    .find((candidate) => candidate.getAttribute('type') === 'submit')
  if (!button) throw new Error(`No submit button named ${name}`)
  return button
}

function emitSync(progress: number, message: string) {
  const event: ProgressEvent = {
    operationId: 'sync-1',
    type: 'sync',
    phase: 'processing',
    progress,
    message,
  }
  for (const callback of useProgressStore
    .getState()
    .typeSubscribers.get('sync') ?? []) {
    callback(event)
  }
}

async function chooseOption(label: string, option: string) {
  const user = userEvent.setup()
  await user.click(screen.getByLabelText(label))
  await user.click(await screen.findByRole('option', { name: option }))
}

describe('ArrInstancesPage', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
    stubViewport({ mobile: false })
    // keeps subscribers from opening the progress EventSource
    useProgressStore.setState({ isConnecting: true, systemStatusCache: {} })
  })

  afterEach(() => {
    queryClient.clear()
    setFormatLocale(undefined)
    vi.unstubAllGlobals()
  })

  it('lists the default instance first with its stored facts', async () => {
    mockEndpoints()
    renderPage()

    const cards = await screen.findAllByRole('region')
    expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual([
      'Sonarr',
      'Sonarr 4K',
    ])
    const [first, second] = cards
    expect(within(first).getByText('Default')).toBeInTheDocument()
    expect(within(first).getByText(main.baseUrl)).toBeInTheDocument()
    expect(await within(first).findByText('HD-1080p')).toBeInTheDocument()
    expect(within(first).getByText('/data/tv')).toBeInTheDocument()
    expect(within(first).getByText('Synced instances')).toBeInTheDocument()
    expect(
      within(second).queryByText('Synced instances'),
    ).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getAllByText('Connected')).toHaveLength(2),
    )
    expect(
      screen.getByText('How Radarr and Sonarr reach Pulsarr.'),
    ).toBeInTheDocument()
  })

  it('shows the empty state on first run and hides the header Add', async () => {
    mockEndpoints({ instances: [placeholder] })
    renderPage()

    expect(
      await screen.findAllByRole('button', { name: 'Add instance' }),
    ).toHaveLength(1)
    expect(
      screen.queryByText('How Radarr and Sonarr reach Pulsarr.'),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('adds an instance once a test fills its options, saving with POST', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints({ instances: [main] })
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: 'Add instance' }),
    )
    expect(screen.getByLabelText('Quality profile')).toBeDisabled()
    await user.type(screen.getByLabelText('Name'), 'Sonarr 4K')
    await user.type(screen.getByLabelText('URL'), NEW_URL)
    await user.type(screen.getByLabelText('API key'), 'key-2')
    expect(saveButton('Add instance')).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Test connection' }))
    const card = screen.getByRole('region', { name: 'Sonarr 4K' })
    expect(await within(card).findByText('Connected')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByLabelText('Quality profile')).toBeEnabled(),
    )
    await chooseOption('Quality profile', 'Ultra-HD')
    await chooseOption('Root folder', '/data/tv-4k')
    await user.click(saveButton('Add instance'))

    await waitFor(() => expect(calls.post).toHaveLength(1))
    expect(calls.post[0]).toMatchObject({
      name: 'Sonarr 4K',
      baseUrl: NEW_URL,
      apiKey: 'key-2',
      qualityProfile: '5',
      rootFolder: '/data/tv-4k',
      isDefault: false,
    })
    expect(calls.put).toHaveLength(0)
    expect(
      await screen.findByRole('button', { name: 'Edit Sonarr 4K' }),
    ).toHaveAttribute('aria-expanded', 'false')
  })

  it('flags an invalid URL on blur and keeps the test disabled until it is fixed', async () => {
    const user = userEvent.setup()
    mockEndpoints({ instances: [main] })
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: 'Add instance' }),
    )
    const url = screen.getByLabelText('URL')
    await user.type(url, 'htt://10.27.27.250:8989')
    await user.tab()
    await user.type(screen.getByLabelText('API key'), 'abc')

    expect(
      await screen.findByText('Must be a valid http(s) URL'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Test connection' }),
    ).toBeDisabled()

    await user.clear(url)
    await user.type(url, 'http://10.27.27.250:8989')

    await waitFor(() =>
      expect(
        screen.queryByText('Must be a valid http(s) URL'),
      ).not.toBeInTheDocument(),
    )
    expect(
      screen.getByRole('button', { name: 'Test connection' }),
    ).toBeEnabled()
  })

  it('saves the first instance over the placeholder with PUT', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints({ instances: [placeholder] })
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: 'Add instance' }),
    )
    const defaultSwitch = screen.getByRole('switch', {
      name: 'Default instance',
    })
    expect(defaultSwitch).toBeChecked()
    expect(defaultSwitch).toHaveAttribute('aria-disabled', 'true')
    await user.type(screen.getByLabelText('Name'), 'Sonarr')
    await user.type(screen.getByLabelText('URL'), main.baseUrl)
    await user.type(screen.getByLabelText('API key'), 'key-1')
    await user.click(screen.getByRole('button', { name: 'Test connection' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Quality profile')).toBeEnabled(),
    )
    await chooseOption('Quality profile', 'HD-1080p')
    await chooseOption('Root folder', '/data/tv')
    await user.click(saveButton('Add instance'))

    await waitFor(() => expect(calls.put).toHaveLength(1))
    expect(calls.put[0]).toMatchObject({
      id: '7',
      body: { name: 'Sonarr', apiKey: 'key-1', isDefault: true },
    })
    expect(calls.post).toHaveLength(0)
  })

  it('saves an edit without a test when the URL and key are unchanged', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: 'Edit Sonarr 4K' }),
    )
    expect(screen.getByLabelText('API key')).toHaveValue('key-2')
    expect(screen.getByLabelText('API key')).toHaveAttribute('type', 'password')
    const name = screen.getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Sonarr UHD')
    expect(saveButton('Save changes')).toBeEnabled()
    await user.click(saveButton('Save changes'))

    await waitFor(() => expect(calls.put).toHaveLength(1))
    expect(calls.put[0].id).toBe('2')
    expect(calls.put[0].body).toMatchObject({
      name: 'Sonarr UHD',
      baseUrl: fourK.baseUrl,
      apiKey: 'key-2',
    })
    expect(await screen.findByText('Changes saved')).toBeInTheDocument()
  })

  it('needs a passed test before saving a changed URL', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: 'Edit Sonarr 4K' }),
    )
    const url = screen.getByLabelText('URL')
    await user.clear(url)
    await user.type(url, NEW_URL)

    const apiKey = screen.getByLabelText('API key')
    expect(apiKey).toHaveAttribute('aria-invalid', 'true')
    expect(
      document.getElementById(apiKey.getAttribute('aria-describedby') ?? ''),
    ).toHaveRole('alert')
    expect(saveButton('Save changes')).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Test connection' }))
    await waitFor(() => expect(saveButton('Save changes')).toBeEnabled())
    expect(screen.getByLabelText('API key')).not.toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(calls.tests.at(-1)).toEqual({ baseUrl: NEW_URL, apiKey: 'key-2' })
    await user.click(saveButton('Save changes'))

    await waitFor(() => expect(calls.put).toHaveLength(1))
    expect(calls.put[0].body).toMatchObject({ baseUrl: NEW_URL })
  })

  it('fixes the webhook address from a failed callback and tests again', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints({ callbackBroken: true })
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: 'Edit Sonarr 4K' }),
    )
    await user.click(screen.getByRole('button', { name: 'Test connection' }))
    const failure = await screen.findByRole('alert')
    expect(failure).toHaveTextContent('http://pulsarr:3003/v1/')
    expect(failure).toHaveTextContent('Unable to post to webhook')
    const testsBefore = calls.tests.length

    await user.click(screen.getByRole('button', { name: 'Fix the address' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(
      within(dialog).getByRole('combobox', {
        name: 'How servers reach Pulsarr',
      }),
    )
    await user.click(await screen.findByRole('option', { name: 'IP address' }))
    await user.type(within(dialog).getByLabelText('Address'), '192.168.1.9')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(calls.config).toEqual([
      { baseUrl: 'http://192.168.1.9', port: 3003 },
    ])
    const card = screen.getByRole('region', { name: 'Sonarr 4K' })
    expect(await within(card).findAllByText('Connected')).not.toHaveLength(0)
    expect(calls.tests.length).toBeGreaterThan(testsBefore)
    expect(calls.tests.at(-1)).toEqual({
      baseUrl: fourK.baseUrl,
      apiKey: 'key-2',
    })
  })

  it('offers the address fix when a save is rejected for the webhook callback', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints({ callbackBroken: true, conflictOnSave: true })
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: 'Edit Sonarr 4K' }),
    )
    const name = screen.getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Sonarr UHD')
    await user.click(saveButton('Save changes'))

    await waitFor(() => expect(calls.put).toHaveLength(1))
    expect(
      await screen.findByRole('button', { name: 'Fix the address' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Changes saved')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Fix the address' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(
      within(dialog).getByRole('combobox', {
        name: 'How servers reach Pulsarr',
      }),
    )
    await user.click(await screen.findByRole('option', { name: 'IP address' }))
    await user.type(within(dialog).getByLabelText('Address'), '192.168.1.9')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(
      screen.queryByRole('button', { name: 'Fix the address' }),
    ).not.toBeInTheDocument()

    await user.click(saveButton('Save changes'))
    await waitFor(() => expect(calls.put).toHaveLength(2))
    expect(calls.put[1].body).toMatchObject({ name: 'Sonarr UHD' })
    expect(await screen.findByText('Changes saved')).toBeInTheDocument()
  })

  it('keeps the webhook address unsaved when the instance save fails', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints({ callbackBroken: true, conflictOnSave: true })
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: 'Edit Sonarr 4K' }),
    )
    const name = screen.getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Sonarr UHD')
    const address = screen.getByLabelText('Address')
    await user.clear(address)
    await user.type(address, 'http://192.168.1.9')
    await user.click(saveButton('Save changes'))

    await waitFor(() => expect(calls.put).toHaveLength(1))
    expect(
      await screen.findByRole('button', { name: 'Fix the address' }),
    ).toBeInTheDocument()
    expect(calls.config).toEqual([])
    expect(screen.getByLabelText('Address')).toHaveValue('http://192.168.1.9')
  })

  it('shows a webhook callback failure on the card health pill', async () => {
    mockEndpoints({ callbackBroken: true })
    renderPage()

    const card = await screen.findByRole('region', { name: 'Sonarr 4K' })
    expect(
      await within(card).findByText("Can't reach Pulsarr"),
    ).toBeInTheDocument()
    expect(within(card).queryByText("Can't connect")).not.toBeInTheDocument()
  })

  it('mounts the editor panel while a card is open and drops it on collapse', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: 'Edit Sonarr 4K' }),
    )
    const panel = screen.getByRole('region', { name: 'Collapse Sonarr 4K' })
    expect(within(panel).getByLabelText('API key')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Collapse Sonarr 4K' }))
    expect(
      await screen.findByRole('button', { name: 'Edit Sonarr 4K' }),
    ).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'Collapse Sonarr 4K' }),
      ).not.toBeInTheDocument(),
    )
    expect(screen.queryByLabelText('API key')).not.toBeInTheDocument()
  })

  it('requires an API key before saving', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: 'Edit Sonarr 4K' }),
    )
    const apiKey = screen.getByLabelText('API key')
    await user.clear(apiKey)
    await user.click(saveButton('Save changes'))

    await waitFor(() =>
      expect(screen.getByLabelText('API key')).toHaveAttribute(
        'aria-invalid',
        'true',
      ),
    )
    expect(calls.put).toHaveLength(0)
  })

  it('locks default-only fields in place on a non-default instance', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: 'Edit Sonarr 4K' }),
    )
    expect(screen.getByLabelText('Synced instances')).toBeDisabled()
    const skip = screen.getByRole('switch', {
      name: 'Skip content no route matches',
    })
    expect(skip).toHaveAttribute('aria-disabled', 'true')

    await user.click(screen.getByRole('switch', { name: 'Default instance' }))
    expect(screen.getByLabelText('Synced instances')).toBeEnabled()
    expect(skip).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('keeps the default on its own instance and blocks removing it', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Edit Sonarr' }))
    expect(
      screen.getByRole('switch', { name: 'Default instance' }),
    ).toHaveAttribute('aria-disabled', 'true')
    expect(
      screen.getByRole('button', { name: 'Remove instance' }),
    ).toBeDisabled()
  })

  it('lists what goes with an instance before removing it', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: 'Edit Sonarr 4K' }),
    )
    await user.click(screen.getByRole('button', { name: 'Remove instance' }))
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByRole('heading', { name: 'Remove Sonarr 4K?' }),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(within(dialog).getAllByRole('listitem')).toHaveLength(4),
    )
    expect(within(dialog).getAllByRole('listitem')[0]).toHaveTextContent('2')
    await user.click(
      within(dialog).getByRole('button', { name: 'Remove Sonarr 4K' }),
    )

    await waitFor(() => expect(calls.deleted).toEqual(['2']))
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'Sonarr 4K' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('puts the placeholder back when the last instance is removed', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints({
      instances: [{ ...main, syncedInstances: [] }],
    })
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Edit Sonarr' }))
    await user.click(screen.getByRole('button', { name: 'Remove instance' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(
      within(dialog).getByRole('button', { name: 'Remove Sonarr' }),
    )

    await waitFor(() => expect(calls.put).toHaveLength(1))
    expect(calls.put[0]).toEqual({ id: '1', body: placeholderSonarrInstance() })
    expect(calls.deleted).toHaveLength(0)
    await waitFor(() =>
      expect(screen.queryByRole('region')).not.toBeInTheDocument(),
    )
  })

  it('offers to copy existing content to every synced instance of the default', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Edit Sonarr' }))
    expect(
      screen.getByRole('button', { name: 'Copy existing content' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit Sonarr 4K' }))
    expect(
      screen.queryByRole('button', { name: 'Copy existing content' }),
    ).not.toBeInTheDocument()
  })

  it('copies existing content to a newly synced instance with progress', async () => {
    const user = userEvent.setup()
    let release: () => void = () => undefined
    const syncGate = new Promise<void>((resolve) => {
      release = resolve
    })
    const calls = mockEndpoints({
      instances: [{ ...main, syncedInstances: [] }, fourK],
      syncGate,
    })
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Edit Sonarr' }))
    await user.click(screen.getByLabelText('Synced instances'))
    await user.click(await screen.findByRole('option', { name: 'Sonarr 4K' }))
    await user.keyboard('{Escape}')
    await user.click(saveButton('Save changes'))

    await waitFor(() => expect(calls.put).toHaveLength(1))
    expect(calls.put[0].body).toMatchObject({ syncedInstances: [2] })
    expect(await screen.findByText('Changes saved')).toBeInTheDocument()
    await user.click(
      await screen.findByRole('button', { name: 'Copy existing content' }),
    )
    expect(
      await screen.findByRole('button', { name: 'Copying...' }),
    ).toBeDisabled()
    emitSync(42, 'Adding shows to Sonarr 4K')
    expect(
      await screen.findByRole('progressbar', { name: 'Sonarr 4K progress' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('42%')).toBeInTheDocument()

    release()
    expect(
      await screen.findByText('Copied 3 shows to Sonarr 4K'),
    ).toBeInTheDocument()
    expect(calls.syncs).toEqual(['2'])
  })

  it('shows a failed webhook row with its reason', async () => {
    const user = userEvent.setup()
    mockEndpoints({
      resync: {
        radarr: [
          { instanceId: 1, name: 'Radarr', success: true, message: 'ok' },
        ],
        sonarr: [
          {
            instanceId: 2,
            name: 'Sonarr 4K',
            success: false,
            message: 'connect ECONNREFUSED 192.168.1.20:8990',
          },
        ],
      },
    })
    renderPage()

    const address = await screen.findByLabelText('Address')
    await user.clear(address)
    await user.type(address, 'http://192.168.1.9')
    await user.click(saveButton('Save changes'))

    const failed = (
      await screen.findByText('connect ECONNREFUSED 192.168.1.20:8990')
    ).closest('tr')
    if (!failed) throw new Error('No row for the failed instance')
    expect(within(failed).getByText('Sonarr 4K')).toBeInTheDocument()
    expect(within(failed).getByText('Failed')).toBeInTheDocument()
    const updated = screen
      .getAllByRole('row')
      .find((row) => within(row).queryByText('Updated'))
    if (!updated) throw new Error('No row for the updated instance')
    expect(within(updated).getByText('Updated')).toBeInTheDocument()
  })

  it('renders the editor and confirm on a phone', async () => {
    stubViewport({ mobile: true })
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: 'Edit Sonarr 4K' }),
    )
    expect(screen.getByLabelText('URL')).toHaveValue(fourK.baseUrl)
    await user.click(screen.getByRole('button', { name: 'Remove instance' }))
    expect(
      await screen.findByRole('button', { name: 'Remove Sonarr 4K' }),
    ).toBeInTheDocument()
  })
})

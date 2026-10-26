import type { LogEntry } from '@root/types/logs.types.js'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { MAX_LOG_LINES } from '@/features/system/lib/logs/log-buffer'
import { logEntryText } from '@/features/system/lib/logs/log-text'
import LogsPage from '@/features/system/pages/logs'
import { formatLogTime, setFormatLocale } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { MAX_SSE_RECONNECT_ATTEMPTS } from '@/lib/sse-retry-policy'
import { useProgressStore } from '@/stores/progressStore'
import type { components } from '@/types/api.js'
import {
  authRequired,
  configError,
  infoLine,
  pingFailed,
  plainLine,
  sentHope,
} from '../../../log-fixtures.js'
import { server } from '../../../setup.js'
import { stubViewport } from '../../../viewport.js'

vi.mock('@/lib/sse-retry-policy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/sse-retry-policy')>()),
  calculateRetryDelay: () => 5,
}))

type ConfigUpdate = components['schemas']['ConfigUpdatePayload']

class FakeEventSource {
  static all: FakeEventSource[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  closed = false

  constructor(readonly url: string) {
    FakeEventSource.all.push(this)
  }

  close() {
    this.closed = true
  }

  get tail() {
    return new URL(this.url).searchParams.get('tail')
  }
}

function latestSource() {
  const source = FakeEventSource.all.at(-1)
  if (!source) throw new Error('No log stream opened')
  return source
}

async function connect() {
  await waitFor(() => expect(FakeEventSource.all.length).toBeGreaterThan(0))
  const source = latestSource()
  act(() => source.onopen?.())
  return source
}

async function send(source: FakeEventSource, entries: readonly LogEntry[]) {
  await act(async () => {
    for (const entry of entries) {
      source.onmessage?.({ data: JSON.stringify(entry) })
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })
}

function mockEndpoints({ failSave = false } = {}) {
  let saved: ConfigUpdate = { logLevel: 'info' }
  const saves: ConfigUpdate[] = []
  server.use(
    http.get('/v1/config', () =>
      HttpResponse.json({ success: true, config: saved }),
    ),
    http.put<never, ConfigUpdate>('/v1/config', async ({ request }) => {
      const body = await request.json()
      saves.push(body)
      if (failSave) {
        return HttpResponse.json(
          { statusCode: 500, error: 'Internal Server Error', message: 'nope' },
          { status: 500 },
        )
      }
      saved = { ...saved, ...body }
      return HttpResponse.json({ success: true, config: saved })
    }),
    http.get('/v1/users/check', () =>
      HttpResponse.json({ success: true, isValid: true }),
    ),
  )
  return saves
}

function renderPage() {
  const router = createMemoryRouter([{ path: '*', element: <LogsPage /> }])
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

async function findTable() {
  return screen.findByRole('table', { name: 'Log lines' })
}

function bodyRows() {
  const table = screen.getByRole('table', { name: 'Log lines' })
  return within(table).getAllByRole('row').slice(1)
}

function rowFor(message: string) {
  const row = bodyRows().find((candidate) =>
    candidate.textContent?.includes(message),
  )
  if (!row) throw new Error(`No row for ${message}`)
  return row
}

function levelWarning() {
  return (
    screen
      .queryAllByRole('alert')
      .find((alert) => alert.dataset.slot === 'alert') ?? null
  )
}

function jumpButton() {
  return screen.queryByRole('button', { name: 'Jump to newest' })
}

async function findSection(title: string) {
  const heading = await screen.findByText(title, {
    selector: '[data-slot="card-title"]',
  })
  const card = heading.closest('[data-slot="card"]')
  if (!(card instanceof HTMLElement)) throw new Error(`No card for ${title}`)
  return card
}

function pageHeaderRow() {
  const row = screen.getByRole('heading', { level: 1 }).parentElement
    ?.parentElement
  if (!row) throw new Error('Page header missing')
  return row
}

function pill(label: string) {
  return screen.getByText(label, { selector: '[data-slot="badge"]' })
}

describe('LogsPage', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
    stubViewport({ mobile: false })
    useProgressStore.setState({ isConnecting: true, systemStatusCache: {} })
    FakeEventSource.all = []
    vi.stubGlobal('EventSource', FakeEventSource)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    queryClient.clear()
    setFormatLocale(undefined)
    vi.unstubAllGlobals()
  })

  it('streams the initial lines with their local time and level tag', async () => {
    mockEndpoints()
    renderPage()
    const source = await connect()

    const params = new URL(source.url).searchParams
    expect(source.tail).toBe('100')
    expect(params.get('follow')).toBe('true')
    expect(params.has('filter')).toBe(false)

    await send(source, [plainLine, authRequired])
    await findTable()
    expect(bodyRows()).toHaveLength(2)
    const row = rowFor('Authentication required')
    expect(
      within(row).getByText(formatLogTime(new Date(authRequired.timestamp))),
    ).toBeInTheDocument()
    expect(within(row).getByText('Warn')).toHaveAttribute(
      'data-variant',
      'warn',
    )
    expect(within(rowFor(plainLine.message)).getByText('Info')).toHaveAttribute(
      'data-variant',
      'ok',
    )
    expect(pill('Live')).toBeInTheDocument()
  })

  it('puts the pill in the page header and the stream actions in the Log lines header', async () => {
    mockEndpoints()
    renderPage()
    await send(await connect(), [plainLine])
    await findTable()

    const pageHeader = pageHeaderRow()
    expect(pageHeader.querySelector('button')).toBeNull()
    expect(within(pageHeader).getByRole('status')).toHaveTextContent('Live')
    const header = (await findSection('Log lines')).querySelector<HTMLElement>(
      '[data-slot="card-header"]',
    )
    if (!header) throw new Error('Log lines header missing')
    expect(
      within(header)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Pause', 'Copy', 'Export', 'Clear'])
    expect(within(header).getByText('1')).toBeInTheDocument()
  })

  it('holds Pause until the stream connects', async () => {
    mockEndpoints()
    renderPage()
    await waitFor(() => expect(FakeEventSource.all).toHaveLength(1))

    expect(await screen.findByRole('button', { name: 'Pause' })).toBeDisabled()
    expect(pill('Connecting')).toBeInTheDocument()

    act(() => latestSource().onopen?.())
    expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled()
  })

  it('stops following when a line opens and jumps back to the newest', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()
    const source = await connect()
    await send(source, [plainLine, sentHope])
    const table = await findTable()
    const scroller = table.closest<HTMLElement>('[data-slot="table-container"]')
    if (!scroller) throw new Error('scroller missing')
    Object.defineProperty(scroller, 'clientHeight', { value: 400 })
    Object.defineProperty(scroller, 'scrollHeight', { value: 2000 })
    scroller.scrollTop = 1600
    fireEvent.scroll(scroller)
    expect(jumpButton()).toBeNull()

    await user.click(screen.getByText('Sent Hope to Radarr'))
    await send(source, [pingFailed, infoLine(1)])
    scroller.scrollTop = 0
    fireEvent.scroll(scroller)
    const jump = screen.getByRole('button', { name: 'Jump to newest' })
    expect(table.closest('[data-slot="card"]')).toContainElement(jump)

    await user.click(jump)
    fireEvent.scroll(scroller)
    expect(scroller.scrollTop).toBe(2000)
    expect(jumpButton()).toBeNull()
  })

  it.each([
    { mobile: false, expected: '444px' },
    { mobile: true, expected: '744px' },
  ])(
    'fills the visible area under the app header (%o)',
    async ({ mobile, expected }) => {
      stubViewport({ mobile })
      vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(
        800,
      )
      const inset = document.createElement('main')
      const appHeader = document.createElement('header')
      appHeader.dataset.slot = 'app-header'
      inset.append(appHeader)
      document.body.append(inset)
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
        function (this: Element) {
          if (this === inset) {
            return new DOMRect(0, 0, 800, 2000)
          }
          if (this === appHeader) return new DOMRect(0, 0, 800, 56)
          const content = this.querySelector('[data-slot="card-content"]')
          if (content) return new DOMRect(0, 0, 800, 900)
          if (
            this === this.parentElement?.lastElementChild &&
            this.parentElement.dataset.slot === 'card-content'
          ) {
            return new DOMRect(0, 0, 800, 600)
          }
          return new DOMRect()
        },
      )
      mockEndpoints()
      renderPage()
      await send(await connect(), [plainLine])
      const frame = (await findTable()).closest<HTMLElement>(
        '[style*="--log-stream-height"]',
      )
      inset.remove()

      expect(frame?.style.getPropertyValue('--log-stream-height')).toBe(
        expected,
      )
    },
  )

  it('scrolls an opened line just far enough to show its detail', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()
    const lines = [
      ...[0, 1, 2].map(infoLine),
      configError,
      ...[3, 4, 5, 6, 7, 8, 9, 10, 11].map(infoLine),
      authRequired,
    ]
    await send(await connect(), lines)
    const table = await findTable()
    const scroller = table.closest<HTMLElement>('[data-slot="table-container"]')
    if (!scroller) throw new Error('scroller missing')
    Object.defineProperty(scroller, 'clientHeight', { value: 400 })
    Object.defineProperty(scroller, 'scrollHeight', { value: 450 })
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: Element) {
        if (this === scroller) return new DOMRect(0, 0, 800, 400)
        if (this.tagName === 'THEAD') return new DOMRect(0, 0, 800, 30)
        if (this.tagName !== 'TR' || !this.parentElement) return new DOMRect()
        let top = 30 - scroller.scrollTop
        for (const sibling of this.parentElement.children) {
          if (sibling === this) break
          top += sibling.hasAttribute('data-row-id') ? 30 : 200
        }
        const height = this.hasAttribute('data-row-id') ? 30 : 200
        return new DOMRect(0, top, 800, height)
      },
    )
    scroller.scrollTop = 50
    fireEvent.scroll(scroller)

    await user.click(screen.getByText('Error initializing config'))
    expect(scroller.scrollTop).toBe(50)

    await user.click(screen.getByText('Authentication required'))
    expect(scroller.scrollTop).toBe(250)
  })

  it('clears the page without touching the stream', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()
    const source = await connect()
    await send(source, [plainLine, sentHope])
    await findTable()

    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(
      screen.queryByRole('table', { name: 'Log lines' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled()
    expect(source.closed).toBe(false)

    await send(source, [pingFailed])
    expect(bodyRows()).toHaveLength(1)
  })

  it('opens only lines with data and shows their fields', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()
    await send(await connect(), [plainLine, authRequired, configError])
    await findTable()

    expect(within(rowFor(plainLine.message)).queryByRole('button')).toBeNull()
    await user.click(screen.getByText(plainLine.message))
    expect(screen.queryByRole('region')).not.toBeInTheDocument()

    await user.click(screen.getByText('Authentication required'))
    const region = screen.getByRole('region', {
      name: 'Data for "Authentication required"',
    })
    expect(within(region).getByText('err.status')).toBeInTheDocument()
    expect(within(region).getByText('401')).toBeInTheDocument()
    expect(within(region).getByText('request.path')).toBeInTheDocument()

    await user.click(screen.getByText('Error initializing config'))
    const stack = screen.getByRole('region', {
      name: 'Data for "Error initializing config"',
    })
    expect(within(stack).getByText(/at prepare/)).toBeInTheDocument()
  })

  it('narrows the rows by search and level and clears both', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()
    await send(await connect(), [plainLine, sentHope, authRequired, pingFailed])
    await findTable()
    const message = screen.getByText('Sent Hope to Radarr')

    await user.type(screen.getByRole('searchbox'), 'hope')
    expect(bodyRows()).toHaveLength(1)
    expect(message).toBeInTheDocument()
    expect(
      within(rowFor('Sent Hope')).getByText('Hope', { selector: 'mark' }),
    ).toBeInTheDocument()

    await user.clear(screen.getByRole('searchbox'))
    await user.click(screen.getByRole('combobox', { name: 'Level' }))
    await user.click(
      await screen.findByRole('option', { name: 'Error or above' }),
    )
    expect(bodyRows()).toHaveLength(1)
    expect(rowFor(pingFailed.message)).toBeInTheDocument()

    await user.type(screen.getByRole('searchbox'), 'maintainerr')
    expect(
      screen.queryByRole('table', { name: 'Log lines' }),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getAllByRole('button', { name: 'Clear filters' })[0],
    )
    await findTable()
    expect(bodyRows()).toHaveLength(4)
    expect(screen.getByRole('searchbox')).toHaveValue('')
  })

  it('pauses, resumes without replaying, and marks the gap', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    vi.stubGlobal('isSecureContext', true)
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined)
    renderPage()
    const first = await connect()
    await send(first, [plainLine])
    await findTable()

    await user.click(screen.getByRole('button', { name: 'Pause' }))
    expect(first.closed).toBe(true)
    expect(pill('Paused')).toBeInTheDocument()
    expect(bodyRows()).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Resume' }))
    const second = latestSource()
    expect(second).not.toBe(first)
    expect(second.tail).toBe('0')
    act(() => second.onopen?.())
    await send(second, [sentHope])

    const rows = bodyRows()
    expect(rows).toHaveLength(3)
    expect(within(rows[1] as HTMLElement).queryByText('Info')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith(
      `${logEntryText(plainLine)}\n\n${logEntryText(sentHope)}`,
    )
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it(`keeps the newest ${MAX_LOG_LINES} lines`, async () => {
    mockEndpoints()
    renderPage()
    const lines = Array.from({ length: MAX_LOG_LINES + 5 }, (_, index) =>
      infoLine(index),
    )
    await send(await connect(), lines)
    await findTable()

    const rows = bodyRows()
    expect(rows).toHaveLength(MAX_LOG_LINES)
    expect(within(rows[0] as HTMLElement).getByText('Line 5')).toBeTruthy()
  })

  it('reconnects with backoff, gives up, and starts over on Reconnect', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()
    const first = await connect()
    await send(first, [plainLine])
    await findTable()

    act(() => first.onerror?.())
    expect(within(pageHeaderRow()).getByRole('status')).toHaveTextContent(
      'Reconnecting',
    )
    const card = within(await findSection('Log lines'))
    expect(card.getByText(/attempt 1 of/)).toHaveTextContent(
      `attempt 1 of ${MAX_SSE_RECONNECT_ATTEMPTS}`,
    )
    expect(bodyRows()).toHaveLength(1)

    for (let attempt = 1; attempt <= MAX_SSE_RECONNECT_ATTEMPTS; attempt++) {
      await waitFor(() => expect(FakeEventSource.all).toHaveLength(attempt + 1))
      const retry = latestSource()
      expect(retry.tail).toBe('0')
      act(() => retry.onerror?.())
    }

    expect(
      await card.findByRole('button', { name: 'Reconnect' }),
    ).toBeInTheDocument()
    expect(pill('Disconnected')).toBeInTheDocument()
    expect(bodyRows()).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Reconnect' }))
    const fresh = latestSource()
    expect(FakeEventSource.all).toHaveLength(MAX_SSE_RECONNECT_ATTEMPTS + 2)
    act(() => fresh.onopen?.())
    expect(pill('Live')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Reconnect' }),
    ).not.toBeInTheDocument()
    await send(fresh, [sentHope])
    expect(bodyRows()).toHaveLength(3)
  })

  it('marks the gap left by an automatic reconnect', async () => {
    mockEndpoints()
    renderPage()
    const first = await connect()
    await send(first, [plainLine])
    await findTable()

    act(() => first.onerror?.())
    await waitFor(() => expect(FakeEventSource.all).toHaveLength(2))
    const second = latestSource()
    act(() => second.onopen?.())
    await send(second, [sentHope])

    const rows = bodyRows()
    expect(rows).toHaveLength(3)
    expect(within(rows[1] as HTMLElement).queryByText('Info')).toBeNull()
  })

  it('shows the placeholder rows while the first connect retries, then only the notice', async () => {
    mockEndpoints()
    renderPage()
    await waitFor(() => expect(FakeEventSource.all).toHaveLength(1))

    act(() => latestSource().onerror?.())
    expect(pill('Reconnecting')).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(document.querySelector('[data-slot="empty"]')).toBeNull()

    for (let attempt = 1; attempt <= MAX_SSE_RECONNECT_ATTEMPTS; attempt++) {
      await waitFor(() => expect(FakeEventSource.all).toHaveLength(attempt + 1))
      act(() => latestSource().onerror?.())
    }

    expect(
      await screen.findByRole('button', { name: 'Reconnect' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(document.querySelector('[data-slot="empty"]')).toBeNull()
  })

  it('copies one line from its detail and exports the shown lines', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    vi.stubGlobal('isSecureContext', true)
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined)
    const blobs: Blob[] = []
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      if (blob instanceof Blob) blobs.push(blob)
      return 'blob:logs'
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    renderPage()
    await send(await connect(), [plainLine, sentHope, pingFailed])
    await findTable()

    await user.click(screen.getByText('Sent Hope to Radarr'))
    await user.click(screen.getByRole('button', { name: 'Copy line' }))
    expect(writeText).toHaveBeenCalledWith(logEntryText(sentHope))
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: 'Level' }))
    await user.click(
      await screen.findByRole('option', { name: 'Error or above' }),
    )
    await user.click(screen.getByRole('button', { name: 'Export' }))
    expect(click).toHaveBeenCalledOnce()
    expect(await blobs[0]?.text()).toBe(logEntryText(pingFailed))
  })

  it('saves a new log level at once and warns about verbose levels', async () => {
    const user = userEvent.setup()
    const saves = mockEndpoints()
    renderPage()
    await connect()

    await user.click(
      await screen.findByRole('combobox', { name: 'Application log level' }),
    )
    await user.click(await screen.findByRole('option', { name: /^Debug/ }))

    await waitFor(() => expect(saves).toEqual([{ logLevel: 'debug' }]))
    await waitFor(() => expect(levelWarning()).toHaveTextContent('Debug'))

    await user.click(
      screen.getByRole('combobox', { name: 'Application log level' }),
    )
    await user.click(await screen.findByRole('option', { name: /^Silent/ }))
    await waitFor(() => expect(saves).toHaveLength(2))
    await waitFor(() => expect(levelWarning()).toHaveTextContent('Silent'))

    await user.click(
      screen.getByRole('combobox', { name: 'Application log level' }),
    )
    await user.click(await screen.findByRole('option', { name: /^Warn/ }))
    await waitFor(() => expect(saves).toHaveLength(3))
    await waitFor(() => expect(levelWarning()).toBeNull())
  })

  it('keeps the saved level when the change fails', async () => {
    const user = userEvent.setup()
    const saves = mockEndpoints({ failSave: true })
    renderPage()
    await connect()

    const select = await screen.findByRole('combobox', {
      name: 'Application log level',
    })
    await user.click(select)
    await user.click(await screen.findByRole('option', { name: /^Trace/ }))

    await waitFor(() => expect(saves).toHaveLength(1))
    await waitFor(() => expect(select).toHaveAttribute('aria-invalid', 'true'))
    expect(select).toHaveTextContent('Info')
    expect(levelWarning()).toBeNull()
  })

  it('remembers Initial lines and reconnects with it', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    const { unmount } = renderPage()
    const first = await connect()
    await send(first, [plainLine])
    await findTable()

    await user.click(screen.getByRole('combobox', { name: 'Initial lines' }))
    await user.click(await screen.findByRole('option', { name: '500' }))

    expect(first.closed).toBe(true)
    expect(latestSource().tail).toBe('500')
    expect(
      screen.queryByRole('table', { name: 'Log lines' }),
    ).not.toBeInTheDocument()
    expect(localStorage.getItem('pulsarr-logs-initial-lines')).toBe('500')

    unmount()
    renderPage()
    await waitFor(() => expect(latestSource().tail).toBe('500'))
  })

  it('connects with no initial lines when Initial lines is None', async () => {
    localStorage.setItem('pulsarr-logs-initial-lines', '0')
    mockEndpoints()
    renderPage()
    const source = await connect()
    expect(source.tail).toBe('0')
  })
})

import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import ApprovalSettingsPage from '@/features/requests/pages/approval-settings'
import type { ScheduleStatus } from '@/hooks/useSchedule'
import { setFormatLocale } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { server } from '../../../setup.js'
import { stubViewport } from '../../../viewport.js'

const savedConfig = {
  approvalNotify: 'all',
  approvalExpiration: {
    enabled: true,
    defaultExpirationHours: 48,
    expirationAction: 'expire',
    autoApproveOnQuotaAvailable: false,
    routerRuleExpirationHours: 24,
    cleanupExpiredDays: 30,
  },
}

function makeSchedule(
  overrides: Partial<Pick<ScheduleStatus, 'enabled' | 'last_run'>> = {},
): ScheduleStatus {
  return {
    id: 1,
    name: 'approval-maintenance',
    type: 'cron',
    config: { expression: '0 */4 * * *' },
    enabled: true,
    last_run: {
      time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      status: 'completed',
    },
    next_run: {
      time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      status: 'pending',
    },
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function mockEndpoints({
  scheduleStatus = 200,
  schedule = makeSchedule(),
} = {}) {
  const configBodies: unknown[] = []
  const scheduleBodies: unknown[] = []
  server.use(
    http.get('/v1/config', () =>
      HttpResponse.json({ success: true, config: savedConfig }),
    ),
    http.get('/v1/scheduler/schedules/approval-maintenance', () =>
      HttpResponse.json(schedule),
    ),
    http.put('/v1/config', async ({ request }) => {
      const body = await request.json()
      configBodies.push(body)
      return HttpResponse.json({
        success: true,
        config: { ...savedConfig, ...(body as object) },
      })
    }),
    http.put(
      '/v1/scheduler/schedules/approval-maintenance',
      async ({ request }) => {
        scheduleBodies.push(await request.json())
        return scheduleStatus === 200
          ? HttpResponse.json({ success: true, message: 'ok' })
          : HttpResponse.json({}, { status: scheduleStatus })
      },
    ),
  )
  return { configBodies, scheduleBodies }
}

function renderPage() {
  const router = createMemoryRouter([
    { path: '*', element: <ApprovalSettingsPage /> },
  ])
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('ApprovalSettingsPage', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
    stubViewport({ mobile: false })
  })

  afterEach(() => {
    queryClient.clear()
    setFormatLocale(undefined)
    vi.unstubAllGlobals()
  })

  it('renders the saved schedule and settings', async () => {
    mockEndpoints()
    renderPage()

    expect(await screen.findByText('Approval maintenance')).toBeInTheDocument()
    expect(screen.getByText('Enabled')).toBeInTheDocument()
    expect(screen.getByText('2 hours ago')).toBeInTheDocument()
    expect(screen.getByText('in 2 hours')).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: 'Run on a schedule' }),
    ).toBeChecked()
    expect(screen.getByLabelText('Run every')).toHaveTextContent(
      'Every 4 hours',
    )
    expect(
      screen.getByRole('switch', { name: 'Expire approval requests' }),
    ).toBeChecked()
    expect(screen.getByLabelText('Expire after')).toHaveValue('48')
    expect(screen.getByRole('radio', { name: /Mark as expired/ })).toBeChecked()
    expect(
      screen.getByLabelText('Send approval notifications to'),
    ).toHaveTextContent('All channels')
    expect(screen.getByLabelText('Delete expired records after')).toHaveValue(
      '30',
    )
    expect(screen.getByRole('button', { name: 'Run now' })).toBeEnabled()
  })

  it('shows a failed last run with its error', async () => {
    mockEndpoints({
      schedule: makeSchedule({
        last_run: {
          time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          status: 'failed',
          error: 'Database is locked',
        },
      }),
    })
    renderPage()

    expect(await screen.findByText('Last run failed')).toBeInTheDocument()
    expect(screen.getByText('Failed 2 hours ago')).toBeInTheDocument()
    expect(screen.getByText('Database is locked')).toBeInTheDocument()
  })

  it('locks Run now while the saved schedule is off', async () => {
    mockEndpoints({ schedule: makeSchedule({ enabled: false }) })
    renderPage()

    expect(await screen.findByText('Disabled')).toBeInTheDocument()
    expect(
      screen.getByText('Turn on the schedule to run it now.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Not scheduled')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run now' })).toBeDisabled()
    expect(screen.getByLabelText('Run every')).toBeDisabled()
  })

  it('locks Run now while the page has unsaved changes', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()

    await user.click(
      await screen.findByRole('switch', { name: 'Expire approval requests' }),
    )

    expect(screen.getByRole('button', { name: 'Run now' })).toBeDisabled()
    expect(
      screen.getByText(
        'Save or discard your changes first. A run uses the saved settings.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Expire after')).toBeDisabled()
  })

  it('keeps the saved config and only the schedule dirty when the schedule save fails', async () => {
    const user = userEvent.setup()
    const { configBodies, scheduleBodies } = mockEndpoints({
      scheduleStatus: 500,
    })
    renderPage()

    await user.click(
      await screen.findByRole('switch', { name: 'Expire approval requests' }),
    )
    await user.click(screen.getByRole('switch', { name: 'Run on a schedule' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText(
        'The schedule was not saved. Save again to retry.',
      ),
    ).toBeInTheDocument()
    expect(configBodies).toHaveLength(1)
    expect(scheduleBodies).toEqual([
      { type: 'cron', config: { expression: '0 */4 * * *' }, enabled: false },
    ])
    expect(screen.getByText('You have unsaved changes')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Discard' }))

    expect(
      screen.getByRole('switch', { name: 'Run on a schedule' }),
    ).toBeChecked()
    expect(
      screen.getByRole('switch', { name: 'Expire approval requests' }),
    ).not.toBeChecked()
    expect(
      screen.queryByText('You have unsaved changes'),
    ).not.toBeInTheDocument()
  })

  it('keeps per-trigger overrides the page does not show when saving', async () => {
    const user = userEvent.setup()
    const { configBodies } = mockEndpoints()
    renderPage()

    const input = await screen.findByLabelText('Expire after')
    await user.clear(input)
    await user.type(input, '96')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Changes saved')).toBeInTheDocument()
    expect(configBodies).toEqual([
      {
        approvalNotify: 'all',
        approvalExpiration: {
          ...savedConfig.approvalExpiration,
          defaultExpirationHours: 96,
        },
      },
    ])
  })
})

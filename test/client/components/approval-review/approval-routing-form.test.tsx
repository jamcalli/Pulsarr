import { ARR_API_KEY_PLACEHOLDER } from '@root/schemas/common/arr-placeholder'
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { ApprovalReviewCredenza } from '@/components/approval-review/approval-review-credenza'
import { withRouting } from '@/lib/approval'
import { setFormatLocale } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import type { components } from '@/types/api.js'
import {
  makeApproval,
  mockApprovalEndpoints,
  mockCreateTag,
  sonarrInstance,
  sonarrRouting,
} from '../../approval-fixtures.js'
import { server } from '../../setup.js'
import { stubViewport } from '../../viewport.js'

type ApprovalRequest = components['schemas']['ApprovalRequest']

function renderReview(
  approval: ApprovalRequest,
  instances?: Parameters<typeof mockApprovalEndpoints>[1],
  onOpenChange: (open: boolean) => void = () => undefined,
) {
  mockApprovalEndpoints(approval, instances)
  server.use(
    http.get('/v1/config', () =>
      HttpResponse.json({
        success: true,
        config: { plexSessionMonitoring: { enabled: false } },
      }),
    ),
  )
  const router = createMemoryRouter([
    {
      path: '*',
      element: (
        <ApprovalReviewCredenza
          approvalId={approval.id}
          open
          onOpenChange={onOpenChange}
        />
      ),
    },
  ])
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

function mockSave(approval: ApprovalRequest, bodies: unknown[] = []) {
  server.use(
    http.patch('/v1/approval/requests/:id', async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json({
        success: true,
        message: 'ok',
        approvalRequest: approval,
      })
    }),
  )
  return bodies
}

async function openForm(buttonName: 'Edit routing' | 'Set routing') {
  const user = userEvent.setup()
  await screen.findByText('Why it was held')
  const dialog = screen.getByRole('dialog')
  await user.click(
    await within(dialog).findByRole('button', { name: buttonName }),
  )
  await within(dialog).findByRole('button', { name: 'Save routing' })
  return { user, dialog }
}

async function pick(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  label: string,
  option: string,
) {
  await user.click(within(dialog).getByLabelText(label))
  await user.click(await screen.findByRole('option', { name: option }))
}

describe('Approval routing form', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
    stubViewport({ mobile: false })
  })

  afterEach(() => {
    queryClient.clear()
    setFormatLocale(undefined)
    vi.unstubAllGlobals()
  })

  it('keeps concrete values with no instance default choice', async () => {
    renderReview(makeApproval())
    const { user, dialog } = await openForm('Edit routing')

    expect(
      within(dialog).getByText(
        'Switching instance resets the fields below to its defaults.',
      ),
    ).toBeInTheDocument()
    await user.click(within(dialog).getByLabelText('Quality profile'))
    expect(
      await screen.findByRole('option', { name: 'HD-1080p' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('option', { name: 'Use instance default' }),
    ).not.toBeInTheDocument()
  })

  it('swaps the summary for the form with the current routing', async () => {
    renderReview(makeApproval())
    const { dialog } = await openForm('Edit routing')

    expect(
      within(dialog).getByText(
        'Changes apply to this request only. Your instance defaults stay as they are.',
      ),
    ).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Instance')).toHaveTextContent(
      'Sonarr (default)',
    )
    expect(within(dialog).getByLabelText('Quality profile')).toHaveTextContent(
      'HD-1080p',
    )
    expect(within(dialog).getByLabelText('Root folder')).toHaveTextContent(
      '/tv',
    )
    expect(
      within(dialog).getByRole('button', { name: 'Remove sarah' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: 'Remove Sonarr 4K' }),
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('switch')).toBeChecked()
    expect(
      within(dialog).queryByRole('button', { name: 'Edit routing' }),
    ).not.toBeInTheDocument()
  })

  it('keeps approve disabled with the reason while editing', async () => {
    renderReview(makeApproval())
    const { user, dialog } = await openForm('Edit routing')

    expect(
      within(dialog).getByRole('button', { name: 'Approve' }),
    ).toBeDisabled()
    expect(
      within(dialog).getByText(
        'Save or cancel your routing changes to approve.',
      ),
    ).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(
      await within(dialog).findByRole('button', { name: 'Edit routing' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: 'Approve' }),
    ).toBeEnabled()
  })

  it('prefills Set routing from the default instance', async () => {
    renderReview(makeApproval({}, null))
    const { dialog } = await openForm('Set routing')

    expect(within(dialog).getByLabelText('Instance')).toHaveTextContent(
      'Sonarr (default)',
    )
    expect(within(dialog).getByLabelText('Quality profile')).toHaveTextContent(
      'HD-1080p',
    )
    expect(within(dialog).getByLabelText('Root folder')).toHaveTextContent(
      '/tv',
    )
  })

  it('resets the profile and folder and hides Also send to when switching off the default', async () => {
    renderReview(makeApproval())
    const { user, dialog } = await openForm('Edit routing')
    expect(within(dialog).getByText('Also send to')).toBeInTheDocument()

    await pick(user, dialog, 'Instance', 'Sonarr 4K')

    await vi.waitFor(() =>
      expect(
        within(dialog).getByLabelText('Quality profile'),
      ).toHaveTextContent('Ultra-HD'),
    )
    expect(within(dialog).getByLabelText('Root folder')).toHaveTextContent(
      '/tv-2',
    )
    expect(within(dialog).queryByText('Also send to')).not.toBeInTheDocument()
  })

  it('hides Also send to when the default is the only instance', async () => {
    renderReview(makeApproval(), [sonarrInstance(1, 'Sonarr', true)])
    const { dialog } = await openForm('Edit routing')

    expect(within(dialog).queryByText('Also send to')).not.toBeInTheDocument()
  })

  it('saves through withRouting and returns to the summary', async () => {
    const approval = makeApproval()
    renderReview(approval)
    const bodies = mockSave(approval)
    const { user, dialog } = await openForm('Edit routing')

    await user.click(within(dialog).getByRole('switch'))
    expect(
      within(dialog).getByText('Add without searching'),
    ).toBeInTheDocument()
    await user.click(
      within(dialog).getByRole('button', { name: 'Save routing' }),
    )

    expect(
      await within(dialog).findByRole('button', { name: 'Edit routing' }),
    ).toBeInTheDocument()
    expect(bodies).toEqual([
      {
        proposedRouterDecision: withRouting(approval, {
          ...sonarrRouting,
          qualityProfile: '4',
          searchOnAdd: false,
        }),
      },
    ])
  })

  it('shows required errors for a missing profile and folder', async () => {
    const bodies: unknown[] = []
    renderReview(
      makeApproval(
        {},
        { ...sonarrRouting, qualityProfile: null, rootFolder: null },
      ),
    )
    server.use(
      http.patch('/v1/approval/requests/:id', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({})
      }),
    )
    const { user, dialog } = await openForm('Edit routing')

    await user.click(within(dialog).getByRole('switch'))
    await user.click(
      within(dialog).getByRole('button', { name: 'Save routing' }),
    )

    expect(
      await within(dialog).findByText('Choose a quality profile.'),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText('Choose a root folder.'),
    ).toBeInTheDocument()
    expect(bodies).toEqual([])
  })

  it('shows the not connected message when the stored instance has no API key', async () => {
    renderReview(
      makeApproval(
        {},
        { ...sonarrRouting, instanceId: 2, syncedInstances: [] },
      ),
      [
        sonarrInstance(1, 'Sonarr', true),
        sonarrInstance(2, 'Sonarr 4K', false, ARR_API_KEY_PLACEHOLDER),
      ],
    )
    const { dialog } = await openForm('Edit routing')

    expect(
      await within(dialog).findByText(
        'This instance is not connected. Check its API key.',
      ),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: 'Save routing' }),
    ).toBeDisabled()
  })

  it('never offers an unconfigured instance as a target or synced instance', async () => {
    renderReview(makeApproval({}, { ...sonarrRouting, syncedInstances: [] }), [
      sonarrInstance(1, 'Sonarr', true),
      sonarrInstance(2, 'Sonarr 4K', false, ARR_API_KEY_PLACEHOLDER),
    ])
    const { user, dialog } = await openForm('Edit routing')

    await user.click(within(dialog).getByLabelText('Instance'))
    expect(
      await screen.findByRole('option', { name: 'Sonarr (default)' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('option', { name: 'Sonarr 4K' }),
    ).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(within(dialog).queryByText('Also send to')).not.toBeInTheDocument()
  })

  it('disables Save routing until a field changes', async () => {
    renderReview(makeApproval())
    const { user, dialog } = await openForm('Edit routing')
    const save = within(dialog).getByRole('button', { name: 'Save routing' })

    expect(save).toBeDisabled()
    await user.click(within(dialog).getByRole('switch'))
    expect(save).toBeEnabled()
    await user.click(within(dialog).getByRole('switch'))
    expect(save).toBeDisabled()
  })

  it('allows saving the prefilled defaults when no routing is stored', async () => {
    renderReview(makeApproval({}, null))
    const { dialog } = await openForm('Set routing')

    expect(
      within(dialog).getByRole('button', { name: 'Save routing' }),
    ).toBeEnabled()
  })

  it('confirms the save until the next action', async () => {
    const approval = makeApproval()
    renderReview(approval)
    mockSave(approval)
    const { user, dialog } = await openForm('Edit routing')

    await user.click(within(dialog).getByRole('switch'))
    await user.click(
      within(dialog).getByRole('button', { name: 'Save routing' }),
    )

    expect(await within(dialog).findByText('Changes saved')).toBeInTheDocument()
    await user.click(
      within(dialog).getByRole('button', { name: 'Edit routing' }),
    )
    await user.click(
      await within(dialog).findByRole('button', { name: 'Cancel' }),
    )
    await within(dialog).findByRole('button', { name: 'Edit routing' })
    expect(within(dialog).queryByText('Changes saved')).not.toBeInTheDocument()
  })

  it('asks before closing with unsaved routing changes', async () => {
    const onOpenChange = vi.fn()
    renderReview(makeApproval(), undefined, onOpenChange)
    const { user, dialog } = await openForm('Edit routing')

    await user.click(within(dialog).getByRole('switch'))
    await user.keyboard('{Escape}')

    expect(await screen.findByText('Leave without saving?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Stay' }))
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(
      within(dialog).getByRole('button', { name: 'Save routing' }),
    ).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await user.click(await screen.findByRole('button', { name: 'Leave' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('closes without asking while the form is pristine', async () => {
    const onOpenChange = vi.fn()
    renderReview(makeApproval(), undefined, onOpenChange)
    const { user } = await openForm('Edit routing')

    await user.keyboard('{Escape}')

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(screen.queryByText('Leave without saving?')).not.toBeInTheDocument()
  })

  it('creates a tag on the instance and selects it', async () => {
    const approval = makeApproval()
    renderReview(approval)
    const created = mockCreateTag('sonarr', { id: 12, label: 'remux' })
    const bodies = mockSave(approval)
    const { user, dialog } = await openForm('Edit routing')

    await user.type(within(dialog).getByLabelText('Tags'), 'remux')
    await user.click(
      await screen.findByRole('option', { name: 'Create tag "remux"' }),
    )

    expect(
      await within(dialog).findByRole('button', { name: 'Remove remux' }),
    ).toBeInTheDocument()
    expect(created).toEqual([{ instanceId: 1, label: 'remux' }])
    await user.keyboard('{Escape}')
    await user.click(
      within(dialog).getByRole('button', { name: 'Save routing' }),
    )
    await within(dialog).findByRole('button', { name: 'Edit routing' })
    expect(bodies).toEqual([
      {
        proposedRouterDecision: withRouting(approval, {
          ...sonarrRouting,
          qualityProfile: '4',
          tags: ['9', '12'],
        }),
      },
    ])
  })
})

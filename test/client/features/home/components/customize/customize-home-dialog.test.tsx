import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CustomizeHomeDialog } from '@/features/home/components/customize/customize-home-dialog'
import { useHomeLayout } from '@/features/home/hooks/useHomeLayout'
import { HOME_CARDS } from '@/features/home/lib/home-cards'
import {
  DEFAULT_HOME_ROWS,
  HOME_CARD_IDS,
  HOME_CARD_SPANS,
} from '@/features/home/lib/home-layout'

function Harness() {
  const homeLayout = useHomeLayout()
  return (
    <CustomizeHomeDialog
      open
      onOpenChange={() => undefined}
      homeLayout={homeLayout}
    />
  )
}

function storedLayout() {
  return JSON.parse(localStorage.getItem('pulsarr-home-layout') ?? '{}')
}

function hiddenList() {
  return screen.getByRole('list', { name: 'Hidden cards' })
}

describe('CustomizeHomeDialog', () => {
  it('lays every card out with row handles, half card handles and hide buttons', async () => {
    render(<Harness />)

    await screen.findByRole('dialog', { name: 'Customize home' })
    expect(screen.getAllByRole('button', { name: /^Hide / })).toHaveLength(9)
    expect(
      screen
        .getAllByRole('button', { name: /^Move .* and / })
        .map((handle) => handle.getAttribute('aria-label')),
    ).toEqual([
      'Move Needs your approval and Most active',
      'Move Request to ready and Notifications',
      'Move Top genres and Library mix',
    ])
    for (const id of HOME_CARD_IDS) {
      const { label } = HOME_CARDS[id]
      const handles = screen.getAllByRole('button', { name: `Move ${label}` })
      expect(handles).toHaveLength(1)
      expect(within(handles[0]).queryByText(label)).not.toBeInTheDocument()
      const ownsRow = handles[0].closest('[data-slot=kanban-item]') === null
      expect(ownsRow).toBe(HOME_CARD_SPANS[id] === 'full')
    }
    expect(screen.queryByText('Full width')).not.toBeInTheDocument()
    expect(screen.queryByText('Half width')).not.toBeInTheDocument()
    expect(screen.queryByText('New row')).not.toBeInTheDocument()
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset layout' })).toBeDisabled()
  })

  it('labels a lone half row apart from its card handle', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(
      await screen.findByRole('button', { name: 'Hide Top genres' }),
    )

    expect(
      screen.getByRole('button', { name: 'Move the Library mix row' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Move Library mix' }),
    ).toBeInTheDocument()
  })

  it('shows the new row target only while a card is dragged', async () => {
    render(<Harness />)

    const cardHandle = screen.getByRole('button', { name: 'Move Most active' })
    fireEvent.keyDown(cardHandle, { code: 'Space' })
    expect(await screen.findByText('New row')).toBeInTheDocument()
    expect(
      screen
        .getByRole('button', { name: 'Move Most active' })
        .closest('[data-slot=kanban-item]'),
    ).toHaveAttribute('data-dragging')
    fireEvent.keyDown(cardHandle, { code: 'Escape' })
    await waitFor(() =>
      expect(screen.queryByText('New row')).not.toBeInTheDocument(),
    )

    const rowHandle = screen.getByRole('button', {
      name: 'Move Request pipeline',
    })
    fireEvent.keyDown(rowHandle, { code: 'Space' })
    expect(rowHandle.closest('[data-slot=kanban-column]')).toHaveAttribute(
      'data-dragging',
    )
    expect(screen.queryByText('New row')).not.toBeInTheDocument()
    fireEvent.keyDown(rowHandle, { code: 'Space' })
    expect(storedLayout()).toEqual({})
  })

  it('moves a hidden card to the hidden list, shows it again, and resets', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(
      await screen.findByRole('button', { name: 'Hide Request pipeline' }),
    )

    expect(
      screen.queryByRole('button', { name: 'Move Request pipeline' }),
    ).not.toBeInTheDocument()
    const showPipeline = within(hiddenList()).getByRole('button', {
      name: 'Show Request pipeline',
    })
    expect(showPipeline).toHaveFocus()
    expect(storedLayout().hidden).toEqual(['pipeline'])

    await user.click(
      screen.getByRole('button', { name: 'Hide Needs your approval' }),
    )
    expect(
      within(hiddenList())
        .getAllByRole('button', { name: /^Show / })
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Show Needs your approval', 'Show Request pipeline'])

    await user.click(
      within(hiddenList()).getByRole('button', {
        name: 'Show Request pipeline',
      }),
    )

    expect(
      screen.getByRole('button', { name: 'Hide Request pipeline' }),
    ).toHaveFocus()
    expect(storedLayout().hidden).toEqual(['approvals'])

    await user.click(screen.getByRole('button', { name: 'Reset layout' }))

    expect(screen.queryByText('Hidden')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset layout' })).toBeDisabled()
    expect(storedLayout()).toEqual({
      rows: DEFAULT_HOME_ROWS.map((row) => [...row]),
      hidden: [],
    })
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { GuardedRemoval } from '@/features/users/components/user/guarded-removal'

function renderRemoval(
  props: Partial<ComponentProps<typeof GuardedRemoval>> = {},
) {
  const handlers = {
    onOpenChange: vi.fn(),
    onOpen: vi.fn(),
    onConfirm: vi.fn(),
  }
  render(
    <GuardedRemoval
      dirty={false}
      open={false}
      label="Remove quotas"
      title="Remove quotas for Maya?"
      description="Their quotas are deleted."
      pending={false}
      errorMessage={null}
      {...handlers}
      {...props}
    />,
  )
  return handlers
}

describe('GuardedRemoval', () => {
  it('clears the last attempt and opens the confirm', async () => {
    const user = userEvent.setup()
    const { onOpen, onOpenChange } = renderRemoval()

    await user.click(screen.getByRole('button', { name: 'Remove quotas' }))

    expect(onOpen).toHaveBeenCalledOnce()
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it('locks the button while a change is unsaved', () => {
    renderRemoval({ dirty: true })

    expect(screen.getByRole('button', { name: 'Remove quotas' })).toBeDisabled()
    expect(
      screen.getByText('Save or discard your changes first.'),
    ).toBeInTheDocument()
  })

  it('confirms with the same label and shows the error', async () => {
    const user = userEvent.setup()
    const { onConfirm } = renderRemoval({ open: true, errorMessage: 'Nope' })

    const dialog = await screen.findByRole('dialog', {
      name: 'Remove quotas for Maya?',
    })
    expect(dialog).toHaveTextContent('Nope')
    const buttons = screen.getAllByRole('button', { name: 'Remove quotas' })
    await user.click(buttons[buttons.length - 1])
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('stays open while the removal is pending', async () => {
    const user = userEvent.setup()
    const { onOpenChange } = renderRemoval({ open: true, pending: true })

    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')

    expect(onOpenChange).not.toHaveBeenCalled()
  })
})

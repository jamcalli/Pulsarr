import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { ConfirmCredenza } from '@/components/confirm-credenza'

function renderConfirm(
  props: Partial<ComponentProps<typeof ConfirmCredenza>> = {},
) {
  const onConfirm = vi.fn()
  render(
    <ConfirmCredenza
      open
      onOpenChange={() => undefined}
      title="Remove tags?"
      description="Strips every tag."
      confirmLabel="Remove"
      onConfirm={onConfirm}
      {...props}
    />,
  )
  return { onConfirm }
}

describe('ConfirmCredenza', () => {
  it('renders the title, description and body content', async () => {
    renderConfirm({ children: <p>Body content</p> })

    const dialog = await screen.findByRole('dialog', { name: 'Remove tags?' })
    expect(dialog).toHaveAccessibleDescription('Strips every tag.')
    expect(screen.getByText('Body content')).toBeInTheDocument()
  })

  it('calls onConfirm from the confirm button', async () => {
    const user = userEvent.setup()
    const { onConfirm } = renderConfirm()

    await user.click(await screen.findByRole('button', { name: 'Remove' }))

    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('shows the pending label and disables both buttons while pending', async () => {
    renderConfirm({ pending: true, pendingLabel: 'Removing...' })

    expect(
      await screen.findByRole('button', { name: 'Removing...' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('renders the error message', async () => {
    renderConfirm({ errorMessage: 'Something broke' })

    expect(await screen.findByText('Something broke')).toBeInTheDocument()
  })
})

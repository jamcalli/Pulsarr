import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SaveBar } from '@/components/settings/save-bar'

describe('SaveBar', () => {
  it('renders nothing while the form is clean', () => {
    render(
      <SaveBar
        dirty={false}
        isSubmitting={false}
        saved={false}
        errorMessage={null}
        onDiscard={vi.fn()}
      />,
    )

    expect(
      screen.queryByText('You have unsaved changes'),
    ).not.toBeInTheDocument()
  })

  it('shows the unsaved changes bar while dirty', () => {
    render(
      <SaveBar
        dirty
        isSubmitting={false}
        saved={false}
        errorMessage={null}
        onDiscard={vi.fn()}
      />,
    )

    expect(screen.getByText('You have unsaved changes')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Save changes' }),
    ).toHaveAttribute('type', 'submit')
  })

  it('calls onDiscard from Discard', async () => {
    const user = userEvent.setup()
    const onDiscard = vi.fn()
    render(
      <SaveBar
        dirty
        isSubmitting={false}
        saved={false}
        errorMessage={null}
        onDiscard={onDiscard}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Discard' }))

    expect(onDiscard).toHaveBeenCalledOnce()
  })
})

describe('SaveBar saved state', () => {
  it('shows the saved message with no buttons once a save lands', () => {
    render(
      <SaveBar
        dirty={false}
        isSubmitting={false}
        saved={true}
        errorMessage={null}
        onDiscard={() => undefined}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Changes saved')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

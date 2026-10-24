import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppForm } from '@/lib/form'

function KeyForm({ initial = '' }: { initial?: string }) {
  const form = useAppForm({ defaultValues: { apiKey: initial } })

  return (
    <form.AppField name="apiKey">
      {(field) => (
        <field.SecretField
          label="API key"
          revealLabel={{ show: 'Show API key', hide: 'Hide API key' }}
        />
      )}
    </form.AppField>
  )
}

describe('SecretField', () => {
  it('cannot reveal while the field is empty', () => {
    render(<KeyForm />)

    expect(screen.getByLabelText('API key')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Show API key' })).toBeDisabled()
  })

  it('reveals a saved value', async () => {
    const user = userEvent.setup()
    render(<KeyForm initial="saved-key" />)

    const input = screen.getByLabelText('API key')
    expect(input).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Show API key' }))

    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveValue('saved-key')
  })

  it('reveals and hides a typed value', async () => {
    const user = userEvent.setup()
    render(<KeyForm />)

    const input = screen.getByLabelText('API key')
    await user.type(input, 'abc123')
    await user.click(screen.getByRole('button', { name: 'Show API key' }))

    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveAttribute('autocomplete', 'off')
    const hide = screen.getByRole('button', { name: 'Hide API key' })
    expect(hide).toHaveAttribute('aria-pressed', 'true')
    await user.click(hide)
    expect(input).toHaveAttribute('type', 'password')
  })

  it('masks again once the typed value is cleared', async () => {
    const user = userEvent.setup()
    render(<KeyForm />)

    const input = screen.getByLabelText('API key')
    await user.type(input, 'abc')
    await user.click(screen.getByRole('button', { name: 'Show API key' }))
    await user.clear(input)

    expect(input).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Show API key' })).toBeDisabled()
  })
})

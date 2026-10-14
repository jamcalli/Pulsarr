import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { z } from 'zod'
import { useAppForm } from '@/lib/form'

const schema = z.object({
  name: z.string().min(1, { error: 'Name is required' }),
})

function NameForm({ action }: { action?: ReactNode } = {}) {
  const form = useAppForm({
    defaultValues: { name: '' },
    validators: { onSubmit: schema },
  })

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <form.AppField name="name">
        {(field) => (
          <field.TextField label="Name" type="text" required action={action} />
        )}
      </form.AppField>
      <button type="submit">Save</button>
    </form>
  )
}

describe('TextField', () => {
  it('associates the label with a required input', () => {
    render(<NameForm />)

    const input = screen.getByLabelText('Name')
    expect(input).toBeRequired()
    expect(input).not.toHaveAttribute('aria-invalid', 'true')
    expect(input).not.toHaveAttribute('aria-describedby')
  })

  it('marks the input invalid and describes it with the error after submit', async () => {
    const user = userEvent.setup()
    render(<NameForm />)

    await user.click(screen.getByRole('button', { name: 'Save' }))

    const input = screen.getByLabelText('Name')
    expect(await screen.findByText('Name is required')).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Name is required')
  })

  it('draws an action beside the input', () => {
    render(<NameForm action={<button type="button">Create key</button>} />)

    const input = screen.getByLabelText('Name')
    expect(input.parentElement).toContainElement(
      screen.getByRole('button', { name: 'Create key' }),
    )
  })
})

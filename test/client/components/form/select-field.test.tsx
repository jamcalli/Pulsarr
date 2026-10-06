import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { z } from 'zod'
import { useAppForm } from '@/lib/form'

const schema = z.object({
  mode: z.enum(['', 'movie', 'show']).refine((value) => value !== '', {
    error: 'Pick a mode',
  }),
})

function ModeForm({ onSubmit }: { onSubmit?: (mode: string) => void }) {
  const form = useAppForm({
    defaultValues: { mode: '' as '' | 'movie' | 'show' },
    validators: { onSubmit: schema },
    onSubmit: ({ value }) => onSubmit?.(value.mode),
  })

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <form.AppField name="mode">
        {(field) => (
          <field.SelectField
            label="Mode"
            options={[
              { value: 'movie', label: 'Movie' },
              { value: 'show', label: 'Show', disabled: true },
            ]}
          />
        )}
      </form.AppField>
      <button type="submit">Save</button>
    </form>
  )
}

describe('SelectField', () => {
  it('associates the label with the trigger', () => {
    render(<ModeForm />)

    const trigger = screen.getByLabelText('Mode')
    expect(trigger).not.toHaveAttribute('aria-invalid', 'true')
    expect(trigger).not.toHaveAttribute('aria-describedby')
  })

  it('marks the trigger invalid and describes it with the error after submit', async () => {
    const user = userEvent.setup()
    render(<ModeForm />)

    await user.click(screen.getByRole('button', { name: 'Save' }))

    const trigger = screen.getByLabelText('Mode')
    expect(await screen.findByText('Pick a mode')).toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-invalid', 'true')
    expect(trigger).toHaveAccessibleDescription('Pick a mode')
  })

  it('writes the picked option to the form and keeps disabled options inert', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ModeForm onSubmit={onSubmit} />)

    await user.click(screen.getByLabelText('Mode'))
    expect(await screen.findByRole('option', { name: 'Show' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await user.click(screen.getByRole('option', { name: 'Movie' }))
    expect(screen.getByLabelText('Mode')).toHaveTextContent('Movie')

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith('movie')
  })
})

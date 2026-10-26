import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { z } from 'zod'
import { useAppForm } from '@/lib/form'

const schema = z.object({
  notes: z.string().min(1, { error: 'Notes are required' }),
})

function NotesForm({ onSubmit }: { onSubmit?: (notes: string) => void }) {
  const form = useAppForm({
    defaultValues: { notes: '' },
    validators: { onSubmit: schema },
    onSubmit: ({ value }) => onSubmit?.(value.notes),
  })

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <form.AppField name="notes">
        {(field) => <field.TextareaField label="Notes" required />}
      </form.AppField>
      <button type="submit">Save</button>
    </form>
  )
}

describe('TextareaField', () => {
  it('associates the label with a required textarea', () => {
    render(<NotesForm />)

    const textarea = screen.getByLabelText('Notes')
    expect(textarea.tagName).toBe('TEXTAREA')
    expect(textarea).toBeRequired()
    expect(textarea).not.toHaveAttribute('aria-describedby')
  })

  it('marks the textarea invalid and describes it with the error after submit', async () => {
    const user = userEvent.setup()
    render(<NotesForm />)

    await user.click(screen.getByRole('button', { name: 'Save' }))

    const textarea = screen.getByLabelText('Notes')
    expect(await screen.findByText('Notes are required')).toBeInTheDocument()
    expect(textarea).toHaveAttribute('aria-invalid', 'true')
    expect(textarea).toHaveAccessibleDescription('Notes are required')
  })

  it('writes typed text to the form', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<NotesForm onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Notes'), 'line one')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSubmit).toHaveBeenCalledWith('line one')
  })
})

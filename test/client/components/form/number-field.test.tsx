import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { z } from 'zod'
import { useAppForm } from '@/lib/form'
import { setFormatLocale } from '@/lib/format'

const schema = z.object({
  hours: z.number({ error: 'Enter a number of hours.' }),
})

function HoursForm({
  hours,
  disabled,
  onSubmit,
}: {
  hours: number | undefined
  disabled?: boolean
  onSubmit?: (hours: number | undefined) => void
}) {
  const form = useAppForm({
    defaultValues: { hours },
    validators: { onSubmit: schema },
    onSubmit: ({ value }) => onSubmit?.(value.hours),
  })

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <form.AppField name="hours">
        {(field) => (
          <field.NumberField
            label="Expire after"
            unit="hour"
            min={1}
            max={8760}
            disabled={disabled}
          />
        )}
      </form.AppField>
      <button type="submit">Save</button>
    </form>
  )
}

describe('NumberField', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
  })

  afterEach(() => {
    setFormatLocale(undefined)
  })

  it('renders the value locale formatted with its unit', () => {
    render(<HoursForm hours={1200} />)

    expect(screen.getByLabelText('Expire after')).toHaveValue('1,200')
    expect(screen.getByText('hours')).toBeInTheDocument()
  })

  it('agrees the unit with the value', () => {
    render(<HoursForm hours={1} />)

    expect(screen.getByText('hour')).toBeInTheDocument()
  })

  it('shows the range under the input', () => {
    render(<HoursForm hours={72} />)

    expect(screen.getByText('1 to 8,760 hours')).toBeInTheDocument()
  })

  it('clamps to the max on blur', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<HoursForm hours={72} onSubmit={onSubmit} />)

    const input = screen.getByLabelText('Expire after')
    await user.clear(input)
    await user.type(input, '99999')
    await user.tab()

    expect(input).toHaveValue('8,760')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith(8760)
  })

  it('replaces the range with the schema error when submitted empty', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<HoursForm hours={72} onSubmit={onSubmit} />)

    const input = screen.getByLabelText('Expire after')
    await user.clear(input)
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText('Enter a number of hours.'),
    ).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Enter a number of hours.')
    expect(screen.queryByText('1 to 8,760 hours')).not.toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('disables the input', () => {
    render(<HoursForm hours={72} disabled />)

    expect(screen.getByLabelText('Expire after')).toBeDisabled()
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppForm } from '@/lib/form'
import { setFormatLocale } from '@/lib/format'

function ScheduleForm({
  expression,
  disabled,
  onSubmit,
}: {
  expression: string
  disabled?: boolean
  onSubmit?: (expression: string) => void
}) {
  const form = useAppForm({
    defaultValues: { expression },
    onSubmit: ({ value }) => onSubmit?.(value.expression),
  })

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <form.AppField name="expression">
        {(field) => <field.ScheduleField label="Run at" disabled={disabled} />}
      </form.AppField>
      <button type="submit">Save</button>
    </form>
  )
}

describe('ScheduleField', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
  })

  afterEach(() => {
    setFormatLocale(undefined)
  })

  it('shows the day and hour of the stored expression under one label', () => {
    render(<ScheduleForm expression="0 15 * * 1" />)

    expect(screen.getByRole('group', { name: 'Run at' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Day' })).toHaveTextContent(
      'Monday',
    )
    expect(screen.getByRole('combobox', { name: 'Hour' })).toHaveTextContent(
      /^3:00\sPM/,
    )
  })

  it('writes the picked day and keeps the hour', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ScheduleForm expression="0 15 * * 1" onSubmit={onSubmit} />)

    await user.click(screen.getByRole('combobox', { name: 'Day' }))
    await user.click(await screen.findByRole('option', { name: 'Every day' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSubmit).toHaveBeenCalledWith('0 15 * * *')
  })

  it('keeps an expression it cannot show until a day or hour is picked', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ScheduleForm expression="30 2 * * 1-5" onSubmit={onSubmit} />)

    expect(screen.getByRole('combobox', { name: 'Day' })).toHaveTextContent(
      'Custom: 30 2 * * 1-5',
    )
    expect(screen.getByRole('combobox', { name: 'Hour' })).toHaveTextContent(
      'Pick an hour',
    )
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenLastCalledWith('30 2 * * 1-5')

    await user.click(screen.getByRole('combobox', { name: 'Hour' }))
    await user.click(await screen.findByRole('option', { name: /^4:00\sAM$/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenLastCalledWith('0 4 * * *')
  })

  it('disables both pickers', () => {
    render(<ScheduleForm expression="0 2 * * *" disabled />)

    expect(screen.getByRole('combobox', { name: 'Day' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Hour' })).toBeDisabled()
  })
})

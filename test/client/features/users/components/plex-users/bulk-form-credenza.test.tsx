import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { BulkFormCredenza } from '@/features/users/components/plex-users/bulk-form-credenza'
import { useAppForm } from '@/lib/form'

function Harness({ onSubmit }: { onSubmit: (alias: string) => void }) {
  const [open, setOpen] = useState(true)
  const form = useAppForm({
    defaultValues: { alias: '' },
    onSubmit: ({ value }) => onSubmit(value.alias),
  })
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Reopen
      </button>
      <BulkFormCredenza
        open={open}
        onOpenChange={setOpen}
        form={form}
        title="Edit settings for 2 users"
        description="Fields left as is keep each user's current value."
        footer={<button type="submit">Apply</button>}
      >
        <form.AppField name="alias">
          {(field) => <field.TextField label="Alias" />}
        </form.AppField>
      </BulkFormCredenza>
    </>
  )
}

describe('BulkFormCredenza', () => {
  it('submits the form from the footer', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    const dialog = await screen.findByRole('dialog', {
      name: 'Edit settings for 2 users',
    })
    expect(dialog).toHaveAccessibleDescription(
      "Fields left as is keep each user's current value.",
    )
    await user.type(screen.getByRole('textbox', { name: 'Alias' }), 'Maya')
    await user.click(screen.getByRole('button', { name: 'Apply' }))

    expect(onSubmit).toHaveBeenCalledWith('Maya')
  })

  it('resets the form each time it opens', async () => {
    const user = userEvent.setup()
    render(<Harness onSubmit={vi.fn()} />)

    await user.type(
      await screen.findByRole('textbox', { name: 'Alias' }),
      'Maya',
    )
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Reopen' }))

    expect(await screen.findByRole('textbox', { name: 'Alias' })).toHaveValue(
      '',
    )
  })
})

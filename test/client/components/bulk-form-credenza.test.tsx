import { useStore } from '@tanstack/react-form'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { BulkFormCredenza } from '@/components/bulk-form-credenza'
import { useAppForm } from '@/lib/form'

const TITLE = 'Edit settings for 2 users'

function Harness({
  onSubmit,
  busy = false,
}: {
  onSubmit: (alias: string) => void
  busy?: boolean
}) {
  const [open, setOpen] = useState(true)
  const form = useAppForm({
    defaultValues: { alias: '' },
    onSubmit: ({ value }) => onSubmit(value.alias),
  })
  const dirty = useStore(form.store, (state) => state.values.alias !== '')
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Reopen
      </button>
      <BulkFormCredenza
        open={open}
        onOpenChange={setOpen}
        form={form}
        title={TITLE}
        description="Fields left as is keep each user's current value."
        dirty={dirty}
        busy={busy}
        footer={(close) => (
          <>
            <button type="button" onClick={close}>
              Discard
            </button>
            <button type="submit">Apply</button>
          </>
        )}
      >
        <form.AppField name="alias">
          {(field) => <field.TextField label="Alias" />}
        </form.AppField>
      </BulkFormCredenza>
    </>
  )
}

function SaveBarHarness({ onSubmit }: { onSubmit: (alias: string) => void }) {
  const [open, setOpen] = useState(true)
  const form = useAppForm({
    defaultValues: { alias: '' },
    onSubmit: ({ value }) => onSubmit(value.alias),
  })
  const dirty = useStore(form.store, (state) => state.values.alias !== '')
  return (
    <BulkFormCredenza
      open={open}
      onOpenChange={setOpen}
      form={form}
      title={TITLE}
      description="Fields left as is keep each user's current value."
      dirty={dirty}
      saveBar={{ message: 'Ready for 2 users', saveLabel: 'Apply' }}
    >
      <form.AppField name="alias">
        {(field) => <field.TextField label="Alias" />}
      </form.AppField>
    </BulkFormCredenza>
  )
}

function leaveDialog() {
  return screen.queryByRole('dialog', { name: 'Leave without saving?' })
}

describe('BulkFormCredenza', () => {
  it('submits the form from the footer', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    const dialog = await screen.findByRole('dialog', { name: TITLE })
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
    await user.click(
      within(
        await screen.findByRole('dialog', { name: 'Leave without saving?' }),
      ).getByRole('button', { name: 'Leave' }),
    )
    await user.click(screen.getByRole('button', { name: 'Reopen' }))

    expect(await screen.findByRole('textbox', { name: 'Alias' })).toHaveValue(
      '',
    )
  })

  it('closes without asking while clean', async () => {
    const user = userEvent.setup()
    render(<Harness onSubmit={vi.fn()} />)

    await screen.findByRole('dialog', { name: TITLE })
    await user.keyboard('{Escape}')

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: TITLE })).toBeNull(),
    )
    expect(leaveDialog()).toBeNull()
  })

  it('asks before the footer discard closes a dirty form, and Stay keeps it', async () => {
    const user = userEvent.setup()
    render(<Harness onSubmit={vi.fn()} />)

    await user.type(
      await screen.findByRole('textbox', { name: 'Alias' }),
      'Maya',
    )
    await user.click(screen.getByRole('button', { name: 'Discard' }))
    const leave = await screen.findByRole('dialog', {
      name: 'Leave without saving?',
    })
    await user.click(within(leave).getByRole('button', { name: 'Stay' }))

    await waitFor(() => expect(leaveDialog()).toBeNull())
    expect(screen.getByRole('textbox', { name: 'Alias' })).toHaveValue('Maya')
  })

  it('ignores a close while busy', async () => {
    const user = userEvent.setup()
    render(<Harness onSubmit={vi.fn()} busy />)

    await screen.findByRole('dialog', { name: TITLE })
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Discard' }))

    expect(screen.getByRole('dialog', { name: TITLE })).toBeInTheDocument()
    expect(leaveDialog()).toBeNull()
  })

  describe('saveBar', () => {
    it('shows a plain Cancel that closes while clean', async () => {
      const user = userEvent.setup()
      render(<SaveBarHarness onSubmit={vi.fn()} />)

      await screen.findByRole('dialog', { name: TITLE })
      expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull()
      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: TITLE })).toBeNull(),
      )
      expect(leaveDialog()).toBeNull()
    })

    it('swaps to the save bar while dirty and submits from it', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn()
      render(<SaveBarHarness onSubmit={onSubmit} />)

      await user.type(
        await screen.findByRole('textbox', { name: 'Alias' }),
        'Maya',
      )
      expect(screen.getByText('Ready for 2 users')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Apply' }))

      expect(onSubmit).toHaveBeenCalledWith('Maya')
    })

    it('asks before the save bar Cancel discards a dirty form', async () => {
      const user = userEvent.setup()
      render(<SaveBarHarness onSubmit={vi.fn()} />)

      await user.type(
        await screen.findByRole('textbox', { name: 'Alias' }),
        'Maya',
      )
      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(
        await screen.findByRole('dialog', { name: 'Leave without saving?' }),
      ).toBeInTheDocument()
    })
  })
})

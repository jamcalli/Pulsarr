import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { z } from 'zod'
import { useAppForm } from '@/lib/form'

const schema = z.object({
  tags: z.array(z.string()).min(1, { error: 'Pick a tag' }),
})

const options = [
  { value: 'hd', label: 'HD' },
  { value: 'anime', label: 'Anime' },
]

function TagsForm({
  initial = [],
  onSubmit,
  onCreate,
  createSchema,
}: {
  initial?: string[]
  onSubmit?: (tags: string[]) => void
  onCreate?: (
    label: string,
  ) =>
    | Promise<{ value: string; label: string }>
    | { value: string; label: string }
  createSchema?: z.ZodType<string, string>
}) {
  const form = useAppForm({
    defaultValues: { tags: initial },
    validators: { onSubmit: schema },
    onSubmit: ({ value }) => onSubmit?.(value.tags),
  })

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <form.AppField name="tags">
        {(field) => (
          <field.TagsField
            label="Tags"
            options={options}
            emptyText="None"
            onCreate={onCreate}
            createSchema={createSchema}
          />
        )}
      </form.AppField>
      <button type="submit">Save</button>
    </form>
  )
}

describe('TagsField', () => {
  it('associates the label with the input and renders chips by label', () => {
    render(<TagsForm initial={['anime']} />)

    expect(screen.getByLabelText('Tags')).toBeInTheDocument()
    expect(screen.getByText('Anime')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Remove Anime' }),
    ).toBeInTheDocument()
  })

  it('marks the input invalid and describes it with the error after submit', async () => {
    const user = userEvent.setup()
    render(<TagsForm />)

    await user.click(screen.getByRole('button', { name: 'Save' }))

    const input = screen.getByLabelText('Tags')
    expect(await screen.findByText('Pick a tag')).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Pick a tag')
  })

  it('adds picked options to the value', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<TagsForm initial={['anime']} onSubmit={onSubmit} />)

    await user.click(screen.getByLabelText('Tags'))
    await user.click(await screen.findByRole('option', { name: 'HD' }))
    await user.keyboard('{Escape}')
    expect(await screen.findByText('HD')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSubmit).toHaveBeenCalledWith(['anime', 'hd'])
  })

  it('offers no create item without onCreate', async () => {
    const user = userEvent.setup()
    render(<TagsForm />)

    await user.type(screen.getByLabelText('Tags'), 'remux')

    expect(
      screen.queryByRole('option', { name: 'Create tag "remux"' }),
    ).not.toBeInTheDocument()
  })

  it('offers a create item only for unmatched input', async () => {
    const user = userEvent.setup()
    render(<TagsForm onCreate={vi.fn()} />)

    const input = screen.getByLabelText('Tags')
    await user.type(input, 'hd')
    expect(
      await screen.findByRole('option', { name: 'HD' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('option', { name: 'Create tag "hd"' }),
    ).not.toBeInTheDocument()

    await user.type(input, 'r')
    expect(
      await screen.findByRole('option', { name: 'Create tag "hdr"' }),
    ).toBeInTheDocument()
  })

  it('creates the tag and selects it', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const onCreate = vi.fn(async (label: string) => ({ value: '12', label }))
    render(<TagsForm onCreate={onCreate} onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Tags'), 'remux')
    await user.click(
      await screen.findByRole('option', { name: 'Create tag "remux"' }),
    )

    expect(
      await screen.findByRole('button', { name: 'Remove remux' }),
    ).toBeInTheDocument()
    expect(onCreate).toHaveBeenCalledWith('remux')
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith(['12'])
  })

  it('shows the tag validation error without calling onCreate', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(<TagsForm onCreate={onCreate} />)

    await user.type(screen.getByLabelText('Tags'), 'Bad Tag')
    await user.click(
      await screen.findByRole('option', { name: 'Create tag "Bad Tag"' }),
    )

    expect(
      await screen.findByText(
        'Tag must contain only lowercase letters (a-z), numbers (0-9), and hyphens (-)',
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Tags')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('shows the failure message when creating fails', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn(async () => {
      throw new Error('Unable to create tag')
    })
    render(<TagsForm onCreate={onCreate} />)

    await user.type(screen.getByLabelText('Tags'), 'remux')
    await user.click(
      await screen.findByRole('option', { name: 'Create tag "remux"' }),
    )

    expect(await screen.findByText('Unable to create tag')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Remove remux' }),
    ).not.toBeInTheDocument()
  })

  it('shows a pending state while creating', async () => {
    const user = userEvent.setup()
    let resolve: (option: { value: string; label: string }) => void = () =>
      undefined
    const onCreate = vi.fn(
      () =>
        new Promise<{ value: string; label: string }>((done) => {
          resolve = done
        }),
    )
    render(<TagsForm onCreate={onCreate} />)

    await user.type(screen.getByLabelText('Tags'), 'remux')
    await user.click(
      await screen.findByRole('option', { name: 'Create tag "remux"' }),
    )

    expect(await screen.findByText('Creating tag...')).toBeInTheDocument()
    resolve({ value: '12', label: 'remux' })
    expect(
      await screen.findByRole('button', { name: 'Remove remux' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Creating tag...')).not.toBeInTheDocument()
  })

  it('adds a synchronous value at once under its own input schema', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <TagsForm
        onSubmit={onSubmit}
        createSchema={z.string().trim().min(1)}
        onCreate={(label) => ({ value: label, label })}
      />,
    )

    await user.type(screen.getByLabelText('Tags'), 'Science Fiction')
    await user.click(
      await screen.findByRole('option', {
        name: 'Create tag "Science Fiction"',
      }),
    )

    expect(
      await screen.findByRole('button', { name: 'Remove Science Fiction' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Creating tag...')).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith(['Science Fiction'])
  })
})

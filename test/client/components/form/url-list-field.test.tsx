import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import type { UrlListField } from '@/components/form/url-list-field'
import { useAppForm } from '@/lib/form'
import { setFormatLocale } from '@/lib/format'
import { discordWebhookRowError } from '@/lib/notification-urls'

const URL_A = 'https://discord.com/api/webhooks/1/a'
const URL_B = 'https://discord.com/api/webhooks/2/b'
const ROW_ERROR =
  'Enter a Discord webhook URL starting https://discord.com/api/webhooks/.'

type UrlListProps = ComponentProps<typeof UrlListField>

function ListForm({
  initial,
  saved = initial,
  testUrl = vi.fn<UrlListProps['testUrl']>(),
  testSaved = vi.fn<UrlListProps['testSaved']>(),
  onValue = () => undefined,
  masked,
}: {
  initial: string
  masked?: boolean
  saved?: string
  testUrl?: UrlListProps['testUrl']
  testSaved?: UrlListProps['testSaved']
  onValue?: (value: string) => void
}) {
  const form = useAppForm({ defaultValues: { urls: initial } })

  return (
    <form.AppField
      name="urls"
      listeners={{ onChange: ({ value }) => onValue(value) }}
    >
      {(field) => (
        <field.UrlListField
          label="Webhook URLs"
          saved={saved}
          masked={masked}
          validateRow={discordWebhookRowError}
          testUrl={testUrl}
          testSaved={testSaved}
        />
      )}
    </form.AppField>
  )
}

function renderList(props: Parameters<typeof ListForm>[0]) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ListForm {...props} />
    </QueryClientProvider>,
  )
}

describe('UrlListField', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
  })

  afterEach(() => {
    setFormatLocale(undefined)
    vi.unstubAllGlobals()
  })

  it('renders one empty row for an empty list', () => {
    renderList({ initial: '' })

    expect(screen.getByLabelText('Webhook URLs, URL 1')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Send test' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Test saved URLs' })).toBeNull()
  })

  it('keeps the comma-separated value in step with the rows', async () => {
    const user = userEvent.setup()
    const onValue = vi.fn()
    renderList({ initial: URL_A, onValue })

    await user.click(screen.getByRole('button', { name: 'Add URL' }))
    await user.type(screen.getByLabelText('Webhook URLs, URL 2'), URL_B)
    expect(onValue).toHaveBeenLastCalledWith(`${URL_A},${URL_B}`)

    await user.click(screen.getByRole('button', { name: 'Remove URL 1' }))
    expect(onValue).toHaveBeenLastCalledWith(URL_B)
    expect(screen.getByLabelText('Webhook URLs, URL 1')).toHaveValue(URL_B)
  })

  it('caps the list at five rows', async () => {
    const user = userEvent.setup()
    renderList({ initial: [1, 2, 3, 4].map((n) => `${URL_A}${n}`).join(',') })

    await user.click(screen.getByRole('button', { name: 'Add URL' }))

    expect(screen.getByRole('button', { name: 'Add URL' })).toBeDisabled()
    expect(screen.getByText('Up to 5 URLs.')).toBeInTheDocument()
  })

  it('flags a row that fails the format check and blocks its test', async () => {
    const user = userEvent.setup()
    renderList({ initial: '' })

    const input = screen.getByLabelText('Webhook URLs, URL 1')
    await user.type(input, 'https://discord.com/api/webhook/1')
    await user.tab()

    expect(input).toHaveAccessibleDescription(ROW_ERROR)
    expect(screen.getByRole('button', { name: 'Send test' })).toBeDisabled()
  })

  it('shows a row result until that row is edited', async () => {
    const user = userEvent.setup()
    const testUrl = vi
      .fn<UrlListProps['testUrl']>()
      .mockResolvedValue({ success: true, statusCode: 204, responseTime: 386 })
    renderList({ initial: URL_A, testUrl })

    await user.click(screen.getByRole('button', { name: 'Send test' }))

    expect(await screen.findByText('HTTP 204, in 386 ms')).toBeInTheDocument()
    expect(testUrl).toHaveBeenCalledWith(URL_A)

    await user.type(screen.getByLabelText('Webhook URLs, URL 1'), 'x')
    expect(screen.queryByText('HTTP 204, in 386 ms')).not.toBeInTheDocument()
  })

  it('shows the server reason when a row test fails', async () => {
    const user = userEvent.setup()
    const testUrl = vi.fn<UrlListProps['testUrl']>().mockResolvedValue({
      success: false,
      error: 'Discord did not accept the test message.',
      responseTime: 120,
    })
    renderList({ initial: URL_A, testUrl })

    await user.click(screen.getByRole('button', { name: 'Send test' }))

    expect(
      await screen.findByText('Discord did not accept the test message.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('tests the saved list and blocks it while the list is dirty', async () => {
    const user = userEvent.setup()
    const testSaved = vi.fn<UrlListProps['testSaved']>().mockResolvedValue({
      success: false,
      error: `1 of 2 URLs failed: ${URL_B} (refused)`,
      responseTime: 400,
    })
    renderList({ initial: `${URL_A},${URL_B}`, testSaved })

    await user.click(screen.getByRole('button', { name: 'Test saved URLs' }))
    expect(
      await screen.findByText(`1 of 2 URLs failed: ${URL_B} (refused)`),
    ).toBeInTheDocument()
    expect(testSaved).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Remove URL 2' }))
    expect(
      screen.getByRole('button', { name: 'Test saved URLs' }),
    ).toBeDisabled()
    expect(
      screen.getByText('Save or discard your changes first.'),
    ).toBeInTheDocument()
  })

  it('renders rows as plain text unless masked', () => {
    renderList({ initial: URL_A })

    expect(screen.getByLabelText('Webhook URLs, URL 1')).toHaveAttribute(
      'type',
      'text',
    )
    expect(
      screen.queryByRole('button', { name: 'Show Webhook URLs URL 1' }),
    ).toBeNull()
  })

  it('masks each row and reveals only the toggled one', async () => {
    const user = userEvent.setup()
    renderList({ initial: `${URL_A},${URL_B}`, masked: true })
    const first = screen.getByLabelText('Webhook URLs, URL 1')
    const second = screen.getByLabelText('Webhook URLs, URL 2')
    expect(first).toHaveAttribute('type', 'password')
    expect(second).toHaveAttribute('type', 'password')

    await user.click(
      screen.getByRole('button', { name: 'Show Webhook URLs URL 2' }),
    )
    expect(second).toHaveAttribute('type', 'text')
    expect(first).toHaveAttribute('type', 'password')

    await user.click(
      screen.getByRole('button', { name: 'Hide Webhook URLs URL 2' }),
    )
    expect(second).toHaveAttribute('type', 'password')
  })

  it('disables the reveal toggle on an empty row', () => {
    renderList({ initial: '', masked: true })

    expect(
      screen.getByRole('button', { name: 'Show Webhook URLs URL 1' }),
    ).toBeDisabled()
  })
})

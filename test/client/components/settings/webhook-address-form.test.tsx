import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WebhookAddressForm } from '@/components/settings/webhook-address-form'
import { FieldGroup } from '@/components/ui/field'
import { useAppForm } from '@/lib/form'
import { setFormatLocale } from '@/lib/format'
import { webhookPresetOf } from '@/lib/webhook-address'

function AddressForm({ baseUrl, port }: { baseUrl: string; port: number }) {
  const form = useAppForm({
    defaultValues: {
      webhook: { preset: webhookPresetOf(baseUrl), baseUrl, port },
    },
  })

  return (
    <FieldGroup>
      <WebhookAddressForm form={form} fields="webhook" />
    </FieldGroup>
  )
}

describe('WebhookAddressForm', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
  })

  afterEach(() => {
    setFormatLocale(undefined)
  })

  it.each([
    ['http://localhost', 'Same machine'],
    ['http://pulsarr', 'Docker network'],
    ['https://pulsarr.example.com', 'Public domain'],
    ['http://192.168.1.5', 'IP address'],
  ])('derives the preset from %s', (baseUrl, label) => {
    render(<AddressForm baseUrl={baseUrl} port={3003} />)

    expect(
      screen.getByRole('combobox', { name: 'How servers reach Pulsarr' }),
    ).toHaveTextContent(label)
  })

  it('shows the port and the address it builds for http', () => {
    render(<AddressForm baseUrl="http://192.168.1.5" port={3003} />)

    expect(screen.getByLabelText('Port')).toHaveValue('3003')
    expect(screen.getByText('http://192.168.1.5:3003/v1/')).toBeInTheDocument()
  })

  it('hides the port for https and leaves it out of the address', () => {
    render(<AddressForm baseUrl="https://pulsarr.example.com" port={443} />)

    expect(screen.queryByLabelText('Port')).not.toBeInTheDocument()
    expect(
      screen.getByText('https://pulsarr.example.com/v1/'),
    ).toBeInTheDocument()
  })

  it('fills the address and port from a picked preset', async () => {
    const user = userEvent.setup()
    render(<AddressForm baseUrl="https://pulsarr.example.com" port={443} />)

    await user.click(
      screen.getByRole('combobox', { name: 'How servers reach Pulsarr' }),
    )
    await user.click(
      await screen.findByRole('option', { name: 'Docker network' }),
    )

    expect(screen.getByLabelText('Address')).toHaveValue('http://pulsarr')
    expect(screen.getByLabelText('Port')).toHaveValue('3003')
  })
})

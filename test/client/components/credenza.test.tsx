import { render, screen } from '@testing-library/react'
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaDescription,
  CredenzaHeader,
  CredenzaTitle,
} from '@/components/credenza'

function stubViewport({ mobile }: { mobile: boolean }) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: mobile && query === '(max-width: 767px)',
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }))
}

function renderCredenza() {
  render(
    <Credenza open>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle>Edit instance</CredenzaTitle>
          <CredenzaDescription>
            Change the Sonarr connection
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody>Form goes here</CredenzaBody>
      </CredenzaContent>
    </Credenza>,
  )
}

describe('Credenza', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders a dialog on desktop', async () => {
    stubViewport({ mobile: false })
    renderCredenza()

    const dialog = await screen.findByRole('dialog', { name: 'Edit instance' })
    expect(dialog).toHaveAttribute('data-slot', 'dialog-content')
    expect(dialog).toHaveAccessibleDescription('Change the Sonarr connection')
    expect(screen.getByText('Form goes here')).toBeInTheDocument()
  })

  it('renders a bottom drawer on mobile', async () => {
    stubViewport({ mobile: true })
    renderCredenza()

    const drawer = await screen.findByRole('dialog', { name: 'Edit instance' })
    expect(drawer).toHaveAttribute('data-slot', 'drawer-popup')
    expect(drawer).toHaveAttribute('data-swipe-direction', 'down')
    expect(screen.getByText('Form goes here')).toBeInTheDocument()
  })
})

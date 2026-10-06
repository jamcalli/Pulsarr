import { render, screen } from '@testing-library/react'
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaDescription,
  CredenzaHeader,
  CredenzaTitle,
} from '@/components/credenza'
import { stubViewport } from '../viewport.js'

function renderCredenza({ fullHeight = false, floatingHandle = false } = {}) {
  render(
    <Credenza open>
      <CredenzaContent fullHeight={fullHeight} floatingHandle={floatingHandle}>
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

  it('opens the drawer at its height cap only when asked', async () => {
    stubViewport({ mobile: true })
    renderCredenza({ fullHeight: true })

    const drawer = await screen.findByRole('dialog', { name: 'Edit instance' })
    expect(drawer.className).toContain('[--drawer-content-height:100dvh]')
  })

  it('floats the swipe handle over the content only when asked', async () => {
    stubViewport({ mobile: true })
    renderCredenza({ floatingHandle: true })

    const drawer = await screen.findByRole('dialog', { name: 'Edit instance' })
    expect(drawer.className).toContain(
      '*:data-[slot=drawer-swipe-handle]:absolute',
    )
  })

  it('leaves the desktop dialog alone when full height is asked', async () => {
    stubViewport({ mobile: false })
    renderCredenza({ fullHeight: true })

    const dialog = await screen.findByRole('dialog', { name: 'Edit instance' })
    expect(dialog.className).not.toContain('--drawer-content-height')
  })
})

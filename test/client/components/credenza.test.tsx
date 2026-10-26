import { fireEvent, render, screen } from '@testing-library/react'
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
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

  it.each([
    ['desktop', false],
    ['phone', true],
  ])(
    'scrolls the body on its own and keeps the footer outside it on %s',
    async (_, mobile) => {
      stubViewport({ mobile })
      render(
        <Credenza open>
          <CredenzaContent>
            <CredenzaHeader>
              <CredenzaTitle>Manage enrollment</CredenzaTitle>
              <CredenzaDescription>Pick shows</CredenzaDescription>
            </CredenzaHeader>
            <CredenzaBody>Long list</CredenzaBody>
            <CredenzaFooter>
              <button type="button">Apply</button>
            </CredenzaFooter>
          </CredenzaContent>
        </Credenza>,
      )

      await screen.findByRole('dialog', { name: 'Manage enrollment' })
      const body = scroller()
      expect(body).toHaveClass('overflow-y-auto', 'min-h-0')
      expect(body).not.toContainElement(
        screen.getByRole('button', { name: 'Apply' }),
      )
    },
  )

  it('draws a divider on each edge that has more content past it', async () => {
    stubViewport({ mobile: false })
    render(
      <Credenza open>
        <CredenzaContent>
          <CredenzaHeader>
            <CredenzaTitle>Manage enrollment</CredenzaTitle>
            <CredenzaDescription>Pick shows</CredenzaDescription>
          </CredenzaHeader>
          <CredenzaBody>Long list</CredenzaBody>
        </CredenzaContent>
      </Credenza>,
    )
    await screen.findByRole('dialog', { name: 'Manage enrollment' })
    const body = scroller()

    sizeScroller(body, 0)
    fireEvent.scroll(body)
    expect(body).toHaveClass('border-b-divider')
    expect(body).not.toHaveClass('border-t-divider')

    sizeScroller(body, 200)
    fireEvent.scroll(body)
    expect(body).toHaveClass('border-t-divider', 'border-b-divider')

    sizeScroller(body, 600)
    fireEvent.scroll(body)
    expect(body).toHaveClass('border-t-divider')
    expect(body).not.toHaveClass('border-b-divider')
  })
})

function scroller(): HTMLElement {
  const scroll = screen.getByText('Long list').parentElement
  if (!scroll) throw new Error('No scroll container')
  return scroll
}

function sizeScroller(el: HTMLElement, scrollTop: number) {
  Object.defineProperties(el, {
    clientHeight: { configurable: true, value: 400 },
    scrollHeight: { configurable: true, value: 1000 },
    scrollTop: { configurable: true, value: scrollTop },
  })
}

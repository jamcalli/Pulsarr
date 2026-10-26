import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AvatarStack } from '@/components/avatar-stack'

class LoadedImage {
  onload: (() => void) | null = null
  complete = false
  set src(_value: string) {
    queueMicrotask(() => this.onload?.())
  }
}

const people = (names: string[]) =>
  names.map((name) => ({ username: name, name }))

describe('AvatarStack', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows an initial per person up to the max', () => {
    render(<AvatarStack people={people(['jamie', 'alex'])} />)

    expect(screen.getByText('J')).toBeInTheDocument()
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument()
  })

  it('shows the avatar image when one is given', async () => {
    vi.stubGlobal('Image', LoadedImage)
    const { container } = render(
      <AvatarStack
        people={[
          {
            username: 'jamie',
            name: 'jamie',
            avatar: 'https://plex.tv/users/jamie.png',
          },
        ]}
      />,
    )

    await waitFor(() => {
      expect(container.querySelector('img')).toHaveAttribute(
        'src',
        'https://plex.tv/users/jamie.png',
      )
    })
  })

  it('collapses the rest into an overflow chip and names everyone in the label', async () => {
    const names = ['ana', 'ben', 'cal', 'dee', 'eli', 'fay']
    render(<AvatarStack people={people(names)} max={4} />)

    expect(screen.getByText('+2')).toBeInTheDocument()
    expect(screen.queryByText('E')).not.toBeInTheDocument()
    const stack = screen.getByRole('img', {
      name: 'ana, ben, cal, dee, eli, fay',
    })

    await userEvent.hover(stack)
    expect(
      await screen.findByText('ana, ben, cal, dee, eli, fay', {
        selector: '[data-slot="tooltip-content"]',
      }),
    ).toBeInTheDocument()
  })

  it('shows three people by default', () => {
    render(<AvatarStack people={people(['ana', 'ben', 'cal', 'dee'])} />)

    expect(screen.getByText('C')).toBeInTheDocument()
    expect(screen.queryByText('D')).not.toBeInTheDocument()
    expect(screen.getByText('+1')).toBeInTheDocument()
  })

  it('renders nothing without people', () => {
    const { container } = render(<AvatarStack people={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

import { fireEvent, render } from '@testing-library/react'
import { MediaBackdrop } from '@/features/home/components/media-detail/media-hero'

function backdropImage(container: HTMLElement) {
  const img = container.querySelector('img')
  if (!img) throw new Error('backdrop image missing')
  return img
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('MediaBackdrop', () => {
  it('stays hidden until the image loads, then fades in', () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(
      false,
    )
    const { container } = render(<MediaBackdrop src="/backdrop.jpg" />)
    const img = backdropImage(container)
    expect(img).toHaveClass('opacity-0')

    fireEvent.load(img)

    expect(img).toHaveClass('opacity-100')
    expect(img).not.toHaveClass('opacity-0')
  })

  it('shows an image that was already cached when it mounted', () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(
      true,
    )
    const { container } = render(<MediaBackdrop src="/backdrop.jpg" />)

    expect(backdropImage(container)).toHaveClass('opacity-100')
  })
})

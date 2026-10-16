import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { ScrollFade } from '@/components/scroll-fade'

function renderScroller({
  clientWidth,
  scrollWidth,
}: {
  clientWidth: number
  scrollWidth: number
}) {
  render(
    <ScrollFade>
      <div style={{ width: scrollWidth }}>wide content</div>
    </ScrollFade>,
  )
  const scroller = screen.getByText('wide content').parentElement
  if (!scroller) throw new Error('scroller missing')
  Object.defineProperty(scroller, 'clientWidth', { value: clientWidth })
  Object.defineProperty(scroller, 'scrollWidth', { value: scrollWidth })
  scroller.scrollBy = vi.fn()
  fireEvent.scroll(scroller)
  return scroller
}

function renderTall({
  bottomAction,
}: {
  bottomAction: ComponentProps<typeof ScrollFade>['bottomAction']
}) {
  render(
    <ScrollFade bottomAction={bottomAction}>
      <div>tall content</div>
    </ScrollFade>,
  )
  const scroller = screen.getByText('tall content').parentElement
  if (!scroller) throw new Error('scroller missing')
  Object.defineProperty(scroller, 'clientHeight', { value: 400 })
  Object.defineProperty(scroller, 'scrollHeight', { value: 1000 })
  fireEvent.scroll(scroller)
  return scroller
}

describe('ScrollFade', () => {
  it('offers nothing when the content fits', () => {
    renderScroller({ clientWidth: 400, scrollWidth: 400 })

    expect(screen.queryByRole('button', { name: /Scroll/ })).toBeNull()
  })

  it('offers the right side at the start and both sides mid scroll', () => {
    const scroller = renderScroller({ clientWidth: 400, scrollWidth: 1000 })

    expect(
      screen.getByRole('button', { name: 'Scroll right' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Scroll left' })).toBeNull()

    scroller.scrollLeft = 300
    fireEvent.scroll(scroller)
    expect(
      screen.getByRole('button', { name: 'Scroll left' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Scroll right' }),
    ).toBeInTheDocument()

    scroller.scrollLeft = 600
    fireEvent.scroll(scroller)
    expect(screen.queryByRole('button', { name: 'Scroll right' })).toBeNull()
  })

  it('offers no bottom action unless the caller opts in', () => {
    const scroller = renderTall({ bottomAction: undefined })

    expect(scroller).not.toHaveClass('mask-b-from-85%')
    expect(screen.queryByRole('button', { name: 'Jump to newest' })).toBeNull()
  })

  it('fades the bottom and offers its action only while content is below', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    const scroller = renderTall({
      bottomAction: { label: 'Jump to newest', onClick },
    })

    expect(scroller).toHaveClass('mask-b-from-85%')
    await user.click(screen.getByRole('button', { name: 'Jump to newest' }))
    expect(onClick).toHaveBeenCalledOnce()

    scroller.scrollTop = 600
    fireEvent.scroll(scroller)
    expect(scroller).not.toHaveClass('mask-b-from-85%')
    expect(screen.queryByRole('button', { name: 'Jump to newest' })).toBeNull()
  })

  it('pages by most of the visible width', async () => {
    const user = userEvent.setup()
    const scroller = renderScroller({ clientWidth: 400, scrollWidth: 1000 })

    await user.click(screen.getByRole('button', { name: 'Scroll right' }))

    expect(scroller.scrollBy).toHaveBeenCalledWith(
      expect.objectContaining({ left: 320 }),
    )
  })
})

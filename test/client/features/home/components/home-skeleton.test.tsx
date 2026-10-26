import { render } from '@testing-library/react'
import { HomeSkeleton } from '@/features/home/components/home-skeleton'

describe('HomeSkeleton', () => {
  it('renders a busy placeholder for every home section', () => {
    const { container } = render(<HomeSkeleton />)

    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(
      container.querySelectorAll('[data-slot="skeleton"]').length,
    ).toBeGreaterThan(40)
  })
})

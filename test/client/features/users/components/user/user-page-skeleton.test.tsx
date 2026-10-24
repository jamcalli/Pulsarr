import { render } from '@testing-library/react'
import { UserPageSkeleton } from '@/features/users/components/user/user-page-skeleton'
import { stubViewport } from '../../../../viewport.js'

describe('UserPageSkeleton', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders a busy placeholder for every section of the page', () => {
    stubViewport({ mobile: false })
    const { container } = render(<UserPageSkeleton />)

    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(
      container.querySelectorAll('[data-slot="skeleton"]').length,
    ).toBeGreaterThan(180)
  })
})

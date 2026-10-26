import { render } from '@testing-library/react'
import { PlexUsersSkeleton } from '@/features/users/components/plex-users/plex-users-skeleton'
import { stubViewport } from '../../../../viewport.js'

describe('PlexUsersSkeleton', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders a busy placeholder for the table and the friends card', () => {
    stubViewport({ mobile: false })
    const { container } = render(<PlexUsersSkeleton />)

    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(
      container.querySelectorAll('[data-slot="skeleton"]').length,
    ).toBeGreaterThan(80)
  })
})

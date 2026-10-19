import { render } from '@testing-library/react'
import { NewUserDefaultsSkeleton } from '@/features/users/components/new-user-defaults/new-user-defaults-skeleton'

describe('NewUserDefaultsSkeleton', () => {
  it('renders a busy placeholder for every new user defaults section', () => {
    const { container } = render(<NewUserDefaultsSkeleton />)

    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(3)
  })
})

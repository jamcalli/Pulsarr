import { render, screen } from '@testing-library/react'
import { PosterRow } from '@/components/poster-row'

describe('PosterRow', () => {
  it('renders each child as a slide with prev and next controls', () => {
    render(
      <PosterRow>
        <span>Dune</span>
        <span>Severance</span>
      </PosterRow>,
    )

    expect(screen.getByText('Dune')).toBeInTheDocument()
    expect(screen.getByText('Severance')).toBeInTheDocument()
    expect(screen.getAllByRole('group')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Previous' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
  })
})

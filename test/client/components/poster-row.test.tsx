import { render, screen } from '@testing-library/react'
import { PosterRow } from '@/components/poster-row'

describe('PosterRow', () => {
  it('shows the skeleton until the carousel loads', async () => {
    const { container } = render(
      <PosterRow heading={<h2>Trending</h2>}>
        <span>Dune</span>
      </PosterRow>,
    )

    expect(
      screen.getByRole('heading', { name: 'Trending' }),
    ).toBeInTheDocument()
    expect(
      container.querySelector('[data-slot="skeleton"]'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Dune')).not.toBeInTheDocument()

    expect(await screen.findByText('Dune')).toBeInTheDocument()
    expect(container.querySelector('[data-slot="skeleton"]')).toBeNull()
  })

  it('renders each child as a slide with prev and next controls', async () => {
    render(
      <PosterRow>
        <span>Dune</span>
        <span>Severance</span>
      </PosterRow>,
    )

    expect(await screen.findByText('Dune')).toBeInTheDocument()
    expect(screen.getByText('Severance')).toBeInTheDocument()
    expect(screen.getAllByRole('group')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Previous' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
  })
})

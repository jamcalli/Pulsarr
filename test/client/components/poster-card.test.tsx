import { render, screen } from '@testing-library/react'
import { PosterCard } from '@/components/poster-card'

describe('PosterCard', () => {
  it('shows the poster image when a thumb is set', () => {
    const { container } = render(
      <PosterCard title="Dune" thumb="/dune.jpg" type="movie" />,
    )

    const image = container.querySelector('img')
    expect(image).toHaveAttribute(
      'src',
      'https://image.tmdb.org/t/p/w300_and_h450_face/dune.jpg',
    )
    expect(image).toHaveAttribute('loading', 'lazy')
    expect(
      container.querySelector('[data-slot="poster-placeholder"]'),
    ).not.toBeInTheDocument()
  })

  it('shows a placeholder without a thumb', () => {
    const { container } = render(
      <PosterCard title="Severance" thumb={null} type="show" />,
    )

    expect(container.querySelector('img')).not.toBeInTheDocument()
    expect(
      container.querySelector('[data-slot="poster-placeholder"]'),
    ).toBeInTheDocument()
    expect(screen.getByText('Severance')).toBeInTheDocument()
  })

  it('becomes a button when it can be selected', () => {
    render(
      <PosterCard title="Dune" thumb={null} type="movie" onSelect={() => {}} />,
    )

    expect(screen.getByRole('button', { name: /Dune/ })).toBeInTheDocument()
  })
})

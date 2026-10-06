import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RankedList } from '@/components/ranked-list'

describe('RankedList', () => {
  it('renders rank, media, title, subtitle and trailing content', () => {
    render(
      <RankedList
        items={[
          {
            key: 'severance',
            rank: 1,
            title: 'Severance',
            media: <span>poster</span>,
            subtitle: '12 watchlists',
            trailing: <span>avatars</span>,
          },
        ]}
      />,
    )

    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('Severance')).toBeInTheDocument()
    expect(screen.getByText('12 watchlists')).toBeInTheDocument()
    expect(screen.getByText('poster')).toBeInTheDocument()
    expect(screen.getByText('avatars')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders rows as buttons when they can be selected', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(
      <RankedList
        items={[{ key: 'dune', rank: 2, title: 'Dune', onSelect }]}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Dune/ }))
    expect(onSelect).toHaveBeenCalledOnce()
  })
})

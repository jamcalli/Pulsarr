import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import NotFoundPage from '@/features/not-found'

describe('NotFoundPage', () => {
  it('explains the missing page and links back to the dashboard', () => {
    const router = createMemoryRouter(
      [{ path: '*', element: <NotFoundPage /> }],
      {
        initialEntries: ['/nope'],
      },
    )
    render(<RouterProvider router={router} />)

    expect(
      screen.getByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Nothing lives at this address. It may have moved or never existed.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/',
    )
  })
})

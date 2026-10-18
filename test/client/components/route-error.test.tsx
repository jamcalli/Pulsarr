import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { RouteError } from '@/components/route-error'

function Boom(): never {
  throw new Error('boom')
}

describe('RouteError', () => {
  it('shows a render error with reload and dashboard actions', async () => {
    const router = createMemoryRouter([
      { path: '/', element: <Boom />, errorElement: <RouteError /> },
    ])
    render(<RouterProvider router={router} />)

    expect(
      await screen.findByRole('heading', { name: 'Something went wrong' }),
    ).toBeInTheDocument()
    expect(screen.getByText('boom')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/',
    )
  })

  it('shows the message of a thrown error body', async () => {
    const router = createMemoryRouter([
      {
        path: '/',
        loader: () => {
          throw { message: 'from a body' }
        },
        element: null,
        errorElement: <RouteError />,
      },
    ])
    render(<RouterProvider router={router} />)

    expect(await screen.findByText('from a body')).toBeInTheDocument()
  })
})

import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { ConfigPageGate } from '@/components/config-page-gate'
import { queryClient } from '@/lib/queryClient'
import { server } from '../setup.js'

function renderGate() {
  const router = createMemoryRouter([
    {
      path: '*',
      element: (
        <ConfigPageGate
          section="Notifications"
          title="Delivery"
          description="When notifications go out."
          skeleton={<div data-testid="skeleton" />}
        >
          {(config) => <p>Port {config.port}</p>}
        </ConfigPageGate>
      ),
    },
  ])
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('ConfigPageGate', () => {
  afterEach(() => {
    queryClient.clear()
  })

  it('renders the children with the loaded config', async () => {
    server.use(
      http.get('/v1/config', () =>
        HttpResponse.json({ success: true, config: { port: 5 } }),
      ),
    )
    renderGate()

    expect(await screen.findByText('Port 5')).toBeInTheDocument()
  })

  it('shows the page header and a retry when the config fails to load', async () => {
    const user = userEvent.setup()
    let fail = true
    server.use(
      http.get('/v1/config', () =>
        fail
          ? HttpResponse.json(
              {
                statusCode: 500,
                error: 'Internal Server Error',
                message: 'Config unavailable',
              },
              { status: 500 },
            )
          : HttpResponse.json({
              success: true,
              config: { port: 10 },
            }),
      ),
    )
    renderGate()

    expect(
      await screen.findByRole('alert', {}, { timeout: 3000 }),
    ).toHaveTextContent('Config unavailable')
    expect(
      screen.getByRole('heading', { name: 'Delivery' }),
    ).toBeInTheDocument()
    fail = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Port 10')).toBeInTheDocument()
  })
})

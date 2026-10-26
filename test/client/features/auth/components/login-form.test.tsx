import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { LoginForm } from '@/features/auth/components/login-form'
import { NAV_PAGES, pageHref } from '@/lib/navigation'
import { server } from '../../../setup.js'

const LOGIN_URL = '/v1/users/login'

function renderLoginForm() {
  const router = createMemoryRouter([{ path: '*', element: <LoginForm /> }], {
    initialEntries: ['/login'],
  })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

function countLoginRequests(response: () => Response) {
  const calls = { count: 0 }
  server.use(
    http.post(LOGIN_URL, () => {
      calls.count++
      return response()
    }),
  )
  return calls
}

async function fillCredentials() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email or username'), 'admin')
  await user.type(screen.getByLabelText('Password'), 'password123')
  return user
}

describe('LoginForm', () => {
  it('shows both schema messages and sends no request on empty submit', async () => {
    const calls = countLoginRequests(() =>
      HttpResponse.json({ success: true, username: 'admin' }),
    )
    const user = userEvent.setup()
    renderLoginForm()

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(
      await screen.findByText('Please enter your email or username'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Password must be at least 8 characters'),
    ).toBeInTheDocument()
    expect(calls.count).toBe(0)
  })

  it('shows the API error message on a 401', async () => {
    countLoginRequests(() =>
      HttpResponse.json(
        {
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid credentials',
        },
        { status: 401 },
      ),
    )
    renderLoginForm()
    const user = await fillCredentials()

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(
      await screen.findByRole('alert', {}, { timeout: 2000 }),
    ).toHaveTextContent('Invalid credentials')
  })

  it('shows a generic message on a network error', async () => {
    countLoginRequests(() => HttpResponse.error())
    renderLoginForm()
    const user = await fillCredentials()

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(
      await screen.findByRole('alert', {}, { timeout: 2000 }),
    ).toHaveTextContent('An unexpected error occurred. Please try again.')
  })

  it('navigates to redirectTo on success', async () => {
    countLoginRequests(() =>
      HttpResponse.json({
        success: true,
        username: 'admin',
        redirectTo: '/app/settings',
      }),
    )
    const router = renderLoginForm()
    const user = await fillCredentials()

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/app/settings'),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('sends one request when the form is submitted twice in a row', async () => {
    const calls = { count: 0 }
    server.use(
      http.post(LOGIN_URL, async () => {
        calls.count++
        await delay(200)
        return HttpResponse.json({ success: true, username: 'admin' })
      }),
    )
    const router = renderLoginForm()
    await fillCredentials()
    const form = screen.getByRole('button', { name: 'Sign in' }).closest('form')
    if (!form) throw new Error('login form not rendered')

    fireEvent.submit(form)
    fireEvent.submit(form)

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        pageHref(NAV_PAGES.dashboard),
      ),
    )
    expect(calls.count).toBe(1)
  })
})

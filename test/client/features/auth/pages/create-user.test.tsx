import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { ThemeProvider } from '@/components/theme-provider'
import CreateUserPage from '@/features/auth/pages/create-user'
import { server } from '../../../setup.js'

const CREATE_ADMIN_URL = '/v1/users/create-admin'

function renderCreateUserPage() {
  const router = createMemoryRouter(
    [
      { path: '/create-user', element: <CreateUserPage /> },
      { path: '/login', element: <p>Login</p> },
    ],
    { initialEntries: ['/create-user'] },
  )
  render(
    <ThemeProvider>
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  )
  return router
}

function captureCreateAdminRequests(response: () => Response) {
  const calls: { count: number; bodies: unknown[] } = { count: 0, bodies: [] }
  server.use(
    http.post(CREATE_ADMIN_URL, async ({ request }) => {
      calls.count++
      calls.bodies.push(await request.json())
      return response()
    }),
  )
  return calls
}

async function fillForm(confirmPassword = 'password123') {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email'), 'admin@example.com')
  await user.type(screen.getByLabelText('Username'), 'admin')
  await user.type(screen.getByLabelText('Password'), 'password123')
  await user.type(screen.getByLabelText('Confirm password'), confirmPassword)
  return user
}

describe('CreateUserPage', () => {
  it('shows the schema messages and sends no request on empty submit', async () => {
    const calls = captureCreateAdminRequests(() =>
      HttpResponse.json(
        { success: true, message: 'Admin user created' },
        { status: 201 },
      ),
    )
    const user = userEvent.setup()
    renderCreateUserPage()

    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(
      await screen.findByText('Please enter a valid email address'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Username must be at least 3 characters'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Password must be at least 8 characters'),
    ).toBeInTheDocument()
    expect(calls.count).toBe(0)
  })

  it('shows the mismatch message and sends no request when passwords differ', async () => {
    const calls = captureCreateAdminRequests(() =>
      HttpResponse.json(
        { success: true, message: 'Admin user created' },
        { status: 201 },
      ),
    )
    renderCreateUserPage()
    const user = await fillForm('password456')

    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText("Passwords don't match")).toBeInTheDocument()
    expect(calls.count).toBe(0)
  })

  it('posts the account without the confirmation and lands on login', async () => {
    const calls = captureCreateAdminRequests(() =>
      HttpResponse.json(
        { success: true, message: 'Admin user created' },
        { status: 201 },
      ),
    )
    const router = renderCreateUserPage()
    const user = await fillForm()

    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(calls.bodies).toEqual([
      {
        email: 'admin@example.com',
        username: 'admin',
        password: 'password123',
      },
    ])
  })

  it('shows the API message on a 409 and stays on the page', async () => {
    captureCreateAdminRequests(() =>
      HttpResponse.json(
        {
          statusCode: 409,
          error: 'Conflict',
          message: 'An admin user already exists in the system',
        },
        { status: 409 },
      ),
    )
    const router = renderCreateUserPage()
    const user = await fillForm()

    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(
      await screen.findByRole('alert', {}, { timeout: 2000 }),
    ).toHaveTextContent('An admin user already exists in the system')
    expect(router.state.location.pathname).toBe('/create-user')
  })
})

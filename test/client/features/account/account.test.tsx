import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import AccountPage from '@/features/account'
import { currentUserKeys } from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'
import { server } from '../../setup.js'
import { stubViewport } from '../../viewport.js'

const CURRENT_PASSWORD = 'current-secret'

function mockEndpoints({ usernameStatus = 200 } = {}) {
  const profile = { username: 'admin', email: 'admin@example.com' }
  const me = { calls: 0 }
  const bodies = {
    email: [] as unknown[],
    username: [] as unknown[],
    password: [] as unknown[],
  }
  server.use(
    http.get('/v1/users/me', () => {
      me.calls += 1
      return HttpResponse.json({
        success: true,
        message: 'ok',
        user: {
          id: 1,
          ...profile,
          role: 'admin',
          avatar: null,
          plexConnected: true,
        },
      })
    }),
    http.put('/v1/users/update-email', async ({ request }) => {
      const body = (await request.json()) as { newEmail: string }
      bodies.email.push(body)
      profile.email = body.newEmail
      return HttpResponse.json({ message: 'Email updated' })
    }),
    http.put('/v1/users/update-username', async ({ request }) => {
      bodies.username.push(await request.json())
      if (usernameStatus !== 200) {
        return HttpResponse.json(
          {
            statusCode: usernameStatus,
            code: 'CONFLICT',
            error: 'Conflict',
            message: 'That username is taken.',
          },
          { status: usernameStatus },
        )
      }
      return HttpResponse.json({ message: 'Username updated' })
    }),
    http.put('/v1/users/update-password', async ({ request }) => {
      bodies.password.push(await request.json())
      return HttpResponse.json({ message: 'Password updated' })
    }),
  )
  return { me, bodies }
}

function renderPage() {
  const router = createMemoryRouter([{ path: '*', element: <AccountPage /> }])
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('AccountPage', () => {
  beforeEach(() => {
    stubViewport({ mobile: false })
  })

  afterEach(() => {
    queryClient.clear()
    vi.unstubAllGlobals()
  })

  it('shows the saved email and username with no save bar while clean', async () => {
    mockEndpoints()
    renderPage()

    expect(await screen.findByLabelText('Email')).toHaveValue(
      'admin@example.com',
    )
    expect(screen.getByLabelText('Username')).toHaveValue('admin')
    expect(
      screen.queryByRole('button', { name: 'Save changes' }),
    ).not.toBeInTheDocument()
  })

  it('updates only the email when only the email changed', async () => {
    const user = userEvent.setup()
    const { bodies } = mockEndpoints()
    renderPage()

    const email = await screen.findByLabelText('Email')
    await user.clear(email)
    await user.type(email, 'new@example.com')
    await user.type(screen.getByLabelText('Current password'), CURRENT_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Changes saved')).toBeInTheDocument()
    expect(bodies.email).toEqual([
      { currentPassword: CURRENT_PASSWORD, newEmail: 'new@example.com' },
    ])
    expect(bodies.username).toEqual([])
    expect(bodies.password).toEqual([])
    expect(screen.getByLabelText('Email')).toHaveValue('new@example.com')
    expect(screen.getByLabelText('Current password')).toHaveValue('')
  })

  it('updates only the password and clears the password fields', async () => {
    const user = userEvent.setup()
    const { bodies } = mockEndpoints()
    renderPage()

    await user.type(await screen.findByLabelText('New password'), 'new-secret')
    await user.type(screen.getByLabelText('Confirm new password'), 'new-secret')
    await user.type(screen.getByLabelText('Current password'), CURRENT_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Changes saved')).toBeInTheDocument()
    expect(bodies.password).toEqual([
      { currentPassword: CURRENT_PASSWORD, newPassword: 'new-secret' },
    ])
    expect(bodies.email).toEqual([])
    expect(bodies.username).toEqual([])
    expect(screen.getByLabelText('New password')).toHaveValue('')
    expect(screen.getByLabelText('Confirm new password')).toHaveValue('')
    expect(screen.getByLabelText('Current password')).toHaveValue('')
  })

  it('blocks a mismatched confirmation', async () => {
    const user = userEvent.setup()
    const { bodies } = mockEndpoints()
    renderPage()

    await user.type(await screen.findByLabelText('New password'), 'new-secret')
    await user.type(screen.getByLabelText('Confirm new password'), 'other-one')
    await user.type(screen.getByLabelText('Current password'), CURRENT_PASSWORD)

    expect(await screen.findByText("Passwords don't match")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(bodies.password).toEqual([])
  })

  it('asks for the current password before saving a changed username', async () => {
    const user = userEvent.setup()
    const { bodies } = mockEndpoints()
    renderPage()

    const username = await screen.findByLabelText('Username')
    await user.clear(username)
    await user.type(username, 'renamed')

    expect(
      await screen.findByText('Enter your current password to save.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(bodies.username).toEqual([])
  })

  it('shows a taken username after the email saved and refreshes the account', async () => {
    const user = userEvent.setup()
    const { me, bodies } = mockEndpoints({ usernameStatus: 409 })
    renderPage()

    const email = await screen.findByLabelText('Email')
    const loads = me.calls
    await user.clear(email)
    await user.type(email, 'new@example.com')
    const username = screen.getByLabelText('Username')
    await user.clear(username)
    await user.type(username, 'taken')
    await user.type(screen.getByLabelText('Current password'), CURRENT_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText('That username is taken.'),
    ).toBeInTheDocument()
    expect(bodies.email).toHaveLength(1)
    expect(bodies.username).toEqual([
      { currentPassword: CURRENT_PASSWORD, newUsername: 'taken' },
    ])
    expect(bodies.password).toEqual([])
    expect(me.calls).toBeGreaterThan(loads)
  })

  it('keeps the form and its edits when a background refetch fails', async () => {
    const user = userEvent.setup()
    const { me } = mockEndpoints()
    renderPage()

    const username = await screen.findByLabelText('Username')
    await user.clear(username)
    await user.type(username, 'renamed')
    const loads = me.calls
    server.use(
      http.get('/v1/users/me', () =>
        HttpResponse.json({ message: 'down' }, { status: 500 }),
      ),
    )
    await act(() =>
      queryClient.invalidateQueries({ queryKey: currentUserKeys.me }),
    )

    await waitFor(() => expect(me.calls).toBe(loads))
    expect(screen.getByLabelText('Username')).toHaveValue('renamed')
    expect(screen.queryByText("Couldn't load your account.")).toBeNull()
  })

  it('keeps the saved email in the form when the refetch after saving fails', async () => {
    const user = userEvent.setup()
    const { bodies } = mockEndpoints()
    renderPage()

    const email = await screen.findByLabelText('Email')
    await user.clear(email)
    await user.type(email, 'new@example.com')
    await user.type(screen.getByLabelText('Current password'), CURRENT_PASSWORD)
    server.use(
      http.get('/v1/users/me', () =>
        HttpResponse.json({ message: 'down' }, { status: 500 }),
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Changes saved')).toBeInTheDocument()
    expect(bodies.email).toHaveLength(1)
    expect(screen.getByLabelText('Email')).toHaveValue('new@example.com')
    expect(screen.getByLabelText('Current password')).toHaveValue('')
  })
})

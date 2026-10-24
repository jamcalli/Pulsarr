import { act, render } from '@testing-library/react'
import { useRef } from 'react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { useScrollReset } from '@/hooks/useScrollReset'

function Layout() {
  const container = useRef<HTMLDivElement>(null)
  useScrollReset(container)
  return (
    <div ref={container} data-testid="container">
      <Outlet />
    </div>
  )
}

function renderRouter() {
  const router = createMemoryRouter(
    [
      {
        element: <Layout />,
        children: [
          { path: '/users', element: <p>Plex users</p> },
          { path: '/users/:id', element: <p>User</p> },
        ],
      },
    ],
    { initialEntries: ['/users'] },
  )
  const { getByTestId } = render(<RouterProvider router={router} />)
  return { router, container: getByTestId('container') }
}

describe('useScrollReset', () => {
  let scrollTo: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  })

  afterEach(() => {
    scrollTo.mockRestore()
  })

  it('leaves the first render where it is', () => {
    renderRouter()

    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('scrolls to the top when a link opens another page', async () => {
    const { router, container } = renderRouter()
    container.scrollTop = 300

    await act(() => router.navigate('/users/2'))

    expect(scrollTo).toHaveBeenCalledWith(0, 0)
    expect(container.scrollTop).toBe(0)
  })

  it('keeps the place when going back', async () => {
    const { router, container } = renderRouter()
    await act(() => router.navigate('/users/2'))
    scrollTo.mockClear()
    container.scrollTop = 300

    await act(() => router.navigate(-1))

    expect(router.state.location.pathname).toBe('/users')
    expect(scrollTo).not.toHaveBeenCalled()
    expect(container.scrollTop).toBe(300)
  })

  it('keeps the place when only the search changes', async () => {
    const { router, container } = renderRouter()
    container.scrollTop = 300

    await act(() => router.navigate('/users?page=2'))

    expect(scrollTo).not.toHaveBeenCalled()
    expect(container.scrollTop).toBe(300)
  })
})

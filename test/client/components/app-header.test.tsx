import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AppHeader } from '@/components/app-header'
import { ThemeProvider } from '@/components/theme-provider'
import { SidebarProvider } from '@/components/ui/sidebar'
import { HELP_LINKS } from '@/lib/navigation'
import { useBreadcrumbStore } from '@/stores/breadcrumbStore'

function renderHeader(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <SidebarProvider>
            <AppHeader />
          </SidebarProvider>
        ),
      },
    ],
    { initialEntries: [path] },
  )
  render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  )
  return within(screen.getByRole('navigation', { name: 'breadcrumb' }))
}

describe('AppHeader', () => {
  afterEach(() => {
    useBreadcrumbStore.setState({ tail: null })
  })

  it('links the section and page crumbs on a user page and ends on the name', () => {
    useBreadcrumbStore.setState({ tail: 'Maya R.' })
    const trail = renderHeader('/users/2')

    expect(trail.getByRole('link', { name: 'Users' })).toHaveAttribute(
      'href',
      '/users',
    )
    expect(trail.getByRole('link', { name: 'Plex users' })).toHaveAttribute(
      'href',
      '/users',
    )
    expect(trail.getByText('Maya R.')).toHaveAttribute('aria-current', 'page')
  })

  it('shows the current page as the last crumb without a link', () => {
    const trail = renderHeader('/requests/settings')

    expect(trail.getByRole('link', { name: 'Requests' })).toHaveAttribute(
      'href',
      '/requests',
    )
    expect(
      trail.queryByRole('link', { name: 'Approval settings' }),
    ).not.toBeInTheDocument()
    expect(trail.getByText('Approval settings')).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('opens every help link in a new tab from the help menu', async () => {
    const user = userEvent.setup()
    renderHeader('/')

    expect(
      screen.queryByRole('link', { name: /Documentation/ }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Help' }))

    for (const { label, href } of HELP_LINKS) {
      const link = await screen.findByRole('menuitem', {
        name: `${label} (opens in a new tab)`,
      })
      expect(link).toHaveAttribute('href', href)
      expect(link).toHaveAttribute('target', '_blank')
    }
  })
})

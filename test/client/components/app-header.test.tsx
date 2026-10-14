import { render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AppHeader } from '@/components/app-header'
import { SettingsProvider } from '@/components/settings-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { SidebarProvider } from '@/components/ui/sidebar'

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
      <SettingsProvider>
        <RouterProvider router={router} />
      </SettingsProvider>
    </ThemeProvider>,
  )
  return within(screen.getByRole('navigation', { name: 'breadcrumb' }))
}

describe('AppHeader', () => {
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
})

import './styles/globals.css'
import './styles/fonts.css'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { SettingsProvider } from '@/components/settings-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { queryClient } from '@/lib/queryClient'
import { router } from '@/router/router'

/**
 * Renders the application's routing provider to enable client-side navigation.
 */
function RootLayoutContent() {
  return <RouterProvider router={router} />
}

/**
 * Provides theme, settings, and query context to the application and renders the main layout content.
 */
function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SettingsProvider>
          <RootLayoutContent />
        </SettingsProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

const rootElement = document.getElementById('app')
if (rootElement === null) throw new Error('Root element not found')

const root = createRoot(rootElement)
root.render(<RootLayout />)

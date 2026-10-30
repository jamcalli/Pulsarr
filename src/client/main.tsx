import './styles/globals.css'
import './styles/fonts.css'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { resolveFormatLocale, setFormatLocale } from '@/lib/format'
import { configureOperationToasts } from '@/lib/operation-toasts'
import { queryClient } from '@/lib/queryClient'
import { router } from '@/router/router'

/**
 * Renders the application's routing provider to enable client-side navigation.
 */
function RootLayoutContent() {
  return <RouterProvider router={router} />
}

/**
 * Provides theme, tooltip, and query context to the application and renders the main layout content.
 */
function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider delay={600}>
          <RootLayoutContent />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

setFormatLocale(
  resolveFormatLocale(
    'en',
    navigator.languages.length > 0 ? navigator.languages : [navigator.language],
  ),
)

configureOperationToasts({
  pathname: () => router.state.location.pathname,
  navigate: (to) => router.navigate(to),
})

const rootElement = document.getElementById('app')
if (rootElement === null) throw new Error('Root element not found')

const root = createRoot(rootElement)
root.render(<RootLayout />)

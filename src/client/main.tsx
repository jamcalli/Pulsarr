import './styles/globals.css'
import './styles/fonts.css'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import PulsarrIcon from '@/assets/images/pulsarr.svg'
import { SettingsProvider } from '@/components/settings-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { router } from '@/router/router'

const setFavicon = () => {
  const link =
    document.querySelector<HTMLLinkElement>("link[rel*='icon']") ||
    document.createElement('link')
  link.type = 'image/svg+xml'
  link.rel = 'icon'
  link.href = PulsarrIcon
  document.head.appendChild(link)
}

setFavicon()

/**
 * Renders the application's routing provider to enable client-side navigation.
 */
function RootLayoutContent() {
  return <RouterProvider router={router} />
}

/**
 * Provides theme and settings context to the application and renders the main layout content.
 */
function RootLayout() {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <RootLayoutContent />
      </SettingsProvider>
    </ThemeProvider>
  )
}

const rootElement = document.getElementById('app')
if (rootElement === null) throw new Error('Root element not found')

const root = createRoot(rootElement)
root.render(<RootLayout />)

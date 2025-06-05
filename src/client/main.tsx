import './styles/globals.css'
import './styles/fonts.css'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@/components/theme-provider'
import { SettingsProvider } from '@/components/settings-provider'
import { RouterProvider } from 'react-router-dom'
import { router } from '@/router/router'
import PulsarrIcon from '@/assets/images/pulsarr.svg'

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

function RootLayoutContent() {
  return <RouterProvider router={router} />
}

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

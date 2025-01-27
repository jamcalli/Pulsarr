import './styles/globals.css'
import './styles/fonts.css'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/toaster'
import ParallaxStarfield from '@/components/ui/starfield'
import CRTOverlay from './components/ui/crt-overlay'
import AsteroidsBackground from './components/ui/asteroids'
import { RouterProvider } from 'react-router-dom'
import { router } from '@/layouts/router'

function RootLayout() {
  return (
    <ThemeProvider>
      {/* Background layer with CRT effect */}
      <div className="fixed inset-0">
        <CRTOverlay>
          <ParallaxStarfield>
            <AsteroidsBackground />
          </ParallaxStarfield>
        </CRTOverlay>
      </div>

      {/* Content layer that sits above the CRT background */}
      <main className="relative min-h-screen w-full flex items-center justify-center">
        <RouterProvider router={router} />
      </main>

      <Toaster />
    </ThemeProvider>
  )
}

const rootElement = document.getElementById('app')
if (rootElement === null) throw new Error('Root element not found')

const root = createRoot(rootElement)
root.render(<RootLayout />)

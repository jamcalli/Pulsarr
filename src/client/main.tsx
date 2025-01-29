import './styles/globals.css'
import './styles/fonts.css'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/toaster'
import ParallaxStarfield from '@/components/ui/starfield'
import CRTOverlay from '@/components/ui/crt-overlay'
import AsteroidsBackground from '@/components/ui/asteroids'
import Pulsar from '@/components/ui/pulsar'
import { RouterProvider } from 'react-router-dom'
import { router } from '@/router/router'

function RootLayout() {
  return (
    <ThemeProvider>
      <div className="fixed inset-0">
        <CRTOverlay>
          {/* Title text container */}
          <div className="absolute top-8 left-0 right-0 z-10">
            <div className="relative">
              <h1
                className="text-5xl font-bold tracking-tighter text-center"
                style={{ color: 'var(--static-text)' }}
              >
                Pulsarr
              </h1>
              {/* Pulsar with lower z-index */}
              <div className="absolute -top-1/7 -translate-y-1/2 left-[calc(50%+3.5rem)] z-[5]">
                <Pulsar className="w-24 h-24" />
              </div>
            </div>
          </div>

          {/* Footer text positioned at the bottom center */}
          <div className="absolute bottom-8 left-0 right-0 z-10">
            <p
              className="text-xl tracking-tighter text-center"
              style={{ color: 'var(--static-text)' }}
            >
              Plex watchlist tracker and notification center.
            </p>
          </div>

          <ParallaxStarfield>
            <AsteroidsBackground />
          </ParallaxStarfield>
        </CRTOverlay>
      </div>

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

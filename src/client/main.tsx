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
import Planet from '@/assets/images/planet.webp'
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

function RootLayout() {
  return (
    <ThemeProvider>
      <div className="fixed inset-0 overflow-hidden">
        <CRTOverlay className="h-full">
          <div className="absolute top-8 left-0 right-0 z-10">
            <div className="relative">
              <h1
                className="text-5xl font-bold tracking-tighter text-center"
                style={{ color: 'var(--static-text)' }}
              >
                Pulsarr
              </h1>
            </div>
          </div>
          <ParallaxStarfield>
            {/* Planet Image */}
            <div className="fixed bottom-0 right-0 z-0 translate-x-1/4 translate-y-1/4 pointer-events-none">
              <div className="relative">
                <img
                  src={Planet}
                  alt="Planet"
                  loading="lazy"
                  className="w-[120vh] h-[120vh] -rotate-180 object-contain transition-all duration-500"
                />
              </div>
            </div>
            {/* Other background elements */}
            <div className="fixed top-32 left-1/2 -translate-x-1/2 -translate-y-32 ml-24 z-[1] pointer-events-none">
              <Pulsar className="w-24 h-24" />
            </div>
            <AsteroidsBackground />
          </ParallaxStarfield>
          <div className="absolute bottom-8 left-0 right-0 z-10">
            <p
              className="text-xl tracking-tighter text-center"
              style={{ color: 'var(--static-text)' }}
            >
              Plex watchlist tracker and notification center.
            </p>
          </div>
        </CRTOverlay>
      </div>
      <main className="fixed inset-0 flex items-center justify-center">
        <RouterProvider router={router} />
      </main>
      <Toaster />
    </ThemeProvider>
  );
}

const rootElement = document.getElementById('app')
if (rootElement === null) throw new Error('Root element not found')

const root = createRoot(rootElement)
root.render(<RootLayout />)

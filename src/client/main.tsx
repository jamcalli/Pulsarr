import './styles/globals.css'
import './styles/fonts.css'
import { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/toaster'
import ParallaxStarfield from '@/components/ui/starfield'
import CRTOverlay from '@/components/ui/crt-overlay'
import AsteroidsBackground from '@/components/ui/asteroids'
import Pulsar from '@/components/ui/pulsar'
import { RouterProvider } from 'react-router-dom'
import { router } from '@/router/router'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import planetDesktop from '@/assets/images/planet.webp'
import planetMobile from '@/assets/images/planet-m.webp'
import PulsarrIcon from '@/assets/images/pulsarr.svg'
import { VersionDisplay } from '@/components/ui/version-display'
import { useMediaQuery } from '@/hooks/use-media-query'

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

// Background component that checks route
function BackgroundLayer() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [isLoginRoute, setIsLoginRoute] = useState(
    window.location.pathname === '/login',
  )

  useEffect(() => {
    // Listen for route changes
    const checkRoute = () => {
      setIsLoginRoute(window.location.pathname === '/login')
    }

    // Check on popstate events
    window.addEventListener('popstate', checkRoute)

    // Also check periodically for programmatic navigation
    const interval = setInterval(checkRoute, 100)

    return () => {
      window.removeEventListener('popstate', checkRoute)
      clearInterval(interval)
    }
  }, [])

  // Show background on desktop always, or on mobile only for login
  const shouldShowBackground = !isMobile || (isMobile && isLoginRoute)

  if (!shouldShowBackground) return null

  return (
    <div className="fixed inset-0">
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
          <div className="fixed bottom-0 right-0 z-0 translate-x-1/4 translate-y-1/4">
            <div
              className={`relative ${isMobile ? 'w-[600px]' : 'w-[1000px]'}`}
            >
              <AspectRatio ratio={1522 / 1608}>
                <picture>
                  <source
                    media={
                      isMobile ? '(max-width: 768px)' : '(min-width: 769px)'
                    }
                    srcSet={isMobile ? planetMobile : planetDesktop}
                    type="image/webp"
                    width={isMobile ? '600' : '1522'}
                    height={isMobile ? '634' : '1608'}
                  />
                  <img
                    src={planetDesktop}
                    alt="Planet"
                    fetchPriority="high"
                    width="1522"
                    height="1608"
                    className="h-full w-full object-cover"
                  />
                </picture>
              </AspectRatio>
            </div>
          </div>
          {/* Other background elements */}
          <div className="fixed top-32 left-1/2 -translate-x-1/2 -translate-y-32 ml-24 z-[-1] pointer-events-none">
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

        {/* Version display in bottom right corner */}
        <div className="absolute bottom-2 right-2 z-10">
          <VersionDisplay
            className="text-xs opacity-50"
            style={{ color: 'var(--static-text)' }}
          />
        </div>
      </CRTOverlay>
    </div>
  )
}

function RootLayoutContent() {
  return (
    <div className="h-screen relative overflow-hidden">
      {/* Background layer */}
      <BackgroundLayer />

      {/* Content layer */}
      <div className="relative h-full flex items-center justify-center">
        <main className="z-10 w-full h-full flex items-center justify-center">
          <RouterProvider router={router} />
        </main>
      </div>
      <Toaster />
    </div>
  )
}

function RootLayout() {
  return (
    <ThemeProvider>
      <RootLayoutContent />
    </ThemeProvider>
  )
}

const rootElement = document.getElementById('app')
if (rootElement === null) throw new Error('Root element not found')

const root = createRoot(rootElement)
root.render(<RootLayout />)

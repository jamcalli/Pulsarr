import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useSettings } from '@/components/settings-provider'
import { Toaster } from '@/components/ui/sonner'
import CRTOverlay from '@/components/ui/crt-overlay'
import ParallaxStarfield from '@/components/ui/starfield'
import AsteroidsBackground from '@/components/ui/asteroids'
import Pulsar from '@/components/ui/pulsar'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import planetDesktop from '@/assets/images/planet.webp'
import planetMobile from '@/assets/images/planet-m.webp'
import { VersionDisplay } from '@/components/ui/version-display'

interface RootLayoutProps {
  children: ReactNode
}

/**
 * Conditionally renders the animated background layer with branding and visual effects based on device type, fullscreen mode, and current route.
 *
 * The background appears on desktop devices only when fullscreen mode is disabled, and on mobile devices only on the login route. It includes a CRT overlay, parallax starfield, responsive planet image, pulsar graphic, optional asteroids animation, a centered title and subtitle, and a version display.
 *
 * @returns The background layer JSX if display conditions are met; otherwise, `null`.
 */
function BackgroundLayer() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const { asteroidsEnabled, fullscreenEnabled } = useSettings()
  const location = useLocation()
  const isLoginRoute = location.pathname === '/login'

  // Show background on desktop (non-fullscreen), or on mobile only for login
  const shouldShowBackground = useMemo(
    () => (!isMobile && !fullscreenEnabled) || (isMobile && isLoginRoute),
    [isMobile, fullscreenEnabled, isLoginRoute],
  )

  if (!shouldShowBackground) return null

  return (
    <div className="fixed inset-0">
      <CRTOverlay className="h-full">
        <div className="absolute top-8 left-0 right-0 z-10">
          <div className="relative">
            <h1
              className="text-5xl font-bold tracking-tighter text-center"
              style={{
                color: 'var(--static-text)',
                textShadow: '3px 3px 0px rgba(0, 0, 0, 0.5)',
              }}
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
              aria-hidden="true"
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
                    alt=""
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
          {asteroidsEnabled && <AsteroidsBackground />}
        </ParallaxStarfield>
        <div className="absolute bottom-8 left-0 right-0 z-10">
          <p
            className="text-xl tracking-tighter text-center"
            style={{
              color: 'var(--static-text)',
              textShadow: '2px 2px 0px rgba(0, 0, 0, 0.5)',
            }}
          >
            Plex watchlist tracker and notification center.
          </p>
        </div>

        {/* Version display in bottom right corner */}
        <div className="absolute bottom-2 right-2 z-10">
          <VersionDisplay
            className="text-xs opacity-50"
            style={{
              color: 'var(--static-text)',
              textShadow: '1px 1px 0px rgba(0, 0, 0, 0.5)',
            }}
          />
        </div>
      </CRTOverlay>
    </div>
  )
}

/**
 * Provides the application's root layout with a dynamic animated background and centered content area.
 *
 * Renders a full-viewport container with a layered background, overlays the main content in the center, and includes a notification toaster.
 *
 * @param children - The main content to display above the background.
 */
export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <div className="h-screen relative overflow-hidden">
      {/* Background layer */}
      <BackgroundLayer />

      {/* Content layer */}
      <div className="relative h-full flex items-center justify-center">
        <main className="z-10 w-full h-full flex items-center justify-center">
          {children}
        </main>
      </div>
      <Toaster />
    </div>
  )
}

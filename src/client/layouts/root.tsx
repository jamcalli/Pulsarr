import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import planetDesktop from '@/assets/images/planet.webp'
import planetMobile from '@/assets/images/planet-m.webp'
import AsteroidsBackground from '@/components/backdrop/asteroids'
import CRTOverlay from '@/components/backdrop/crt-overlay'
import Pulsar from '@/components/backdrop/pulsar'
import ParallaxStarfield from '@/components/backdrop/starfield'
import { Toaster as LegacyToaster } from '@/components/ui/sonner'
import { Toaster } from '@/components/ui/toast'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { usePageVisibility } from '@/hooks/usePageVisibility'
import { useSettings } from '@/hooks/useSettings'
import { AspectRatio } from '@/legacy/components/ui/aspect-ratio'

interface RootLayoutProps {
  children: ReactNode
}

/**
 * Renders the animated background layer with branding and visual effects when appropriate for the device type, fullscreen mode, and current route.
 *
 * The background is shown on desktop devices only if fullscreen mode is disabled, and on mobile devices only on the login route. It features a CRT overlay, parallax starfield, responsive planet image, pulsar graphic, optional asteroids animation, and a centered title and subtitle.
 *
 * @returns The background layer JSX if display conditions are met; otherwise, `null`.
 */
function BackgroundLayer() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const isPageVisible = usePageVisibility()
  const { asteroidsEnabled, fullscreenEnabled } = useSettings()
  const location = useLocation()
  const isLoginRoute = location.pathname === '/login'

  // Show background on login route always, or on desktop when fullscreen is disabled
  const shouldShowBackground = useMemo(
    () => isLoginRoute || (!isMobile && !fullscreenEnabled),
    [isMobile, fullscreenEnabled, isLoginRoute],
  )

  if (!shouldShowBackground) return null

  return (
    <div
      className={`fixed inset-0 pointer-events-none${isPageVisible ? '' : ' animations-paused'}`}
    >
      <CRTOverlay className="h-full">
        <div className="absolute top-8 left-0 right-0 z-10">
          <div className="relative">
            <h1
              className="text-5xl font-bold tracking-tighter text-center text-backdrop-title"
              style={{
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
              className={`relative ${isMobile ? 'w-150' : 'w-250'}`}
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
            className="text-xl tracking-tighter text-center text-backdrop-title"
            style={{
              textShadow: '2px 2px 0px rgba(0, 0, 0, 0.5)',
            }}
          >
            Plex watchlist tracker and notification center.
          </p>
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
    <div className="relative min-h-svh">
      <BackgroundLayer />
      <main className="relative z-10 flex min-h-svh items-center justify-center">
        {children}
      </main>
      <LegacyToaster />
      <Toaster />
    </div>
  )
}

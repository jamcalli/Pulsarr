import React from 'react'
import Layout from '@theme/Layout'
import Starfield from '@/client/components/ui/starfield'
import CrtOverlay from '@/client/components/ui/crt-overlay'
import Asteroids from '@/client/components/ui/asteroids'
import { AspectRatio } from '@/client/components/ui/aspect-ratio'
import { useMediaQuery } from '@/client/hooks/use-media-query'
import planetDesktop from '@/client/assets/images/planet.webp'
import planetMobile from '@/client/assets/images/planet-m.webp'

export default function BackgroundTest(): React.ReactElement {
  const isMobile = useMediaQuery('(max-width: 768px)')

  return (
    <Layout
      title="Background Test"
      description="Testing main app background components"
    >
      <div
        style={{ position: 'relative', height: '100vh', overflow: 'hidden' }}
      >
        {/* Background layer */}
        <div style={{ position: 'fixed', inset: 0 }}>
          <CrtOverlay className="h-full">
            <Starfield>
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

              {/* Asteroids */}
              <Asteroids />
            </Starfield>
          </CrtOverlay>
        </div>

        {/* Content overlay */}
        <div style={{ position: 'relative', zIndex: 10, padding: '2rem' }}>
          <h1
            style={{
              color: 'var(--static-text)',
              fontSize: '3rem',
              fontWeight: 'bold',
              textAlign: 'center',
            }}
          >
            Background Test Page
          </h1>
          <p
            style={{
              color: 'var(--static-text)',
              fontSize: '1.25rem',
              textAlign: 'center',
              marginTop: '1rem',
            }}
          >
            This page tests the starfield, CRT overlay, planet, and asteroids
            from the main app.
          </p>

          <div
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              padding: '2rem',
              marginTop: '2rem',
              borderRadius: '8px',
              maxWidth: '600px',
              margin: '2rem auto',
            }}
          >
            <h2 style={{ color: 'var(--static-text)' }}>
              Content with Background
            </h2>
            <p style={{ color: 'var(--text)' }}>
              This is some content displayed over the animated background.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  )
}

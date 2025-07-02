import React from 'react'
import { useEffect } from 'react'
import { useHistory } from '@docusaurus/router'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'
import useBaseUrl from '@docusaurus/useBaseUrl'
import Layout from '@theme/Layout'
import BrowserOnly from '@docusaurus/BrowserOnly'
import Heading from '@theme/Heading'
import DocFeatureExample from '../components/DocFeatureExample'

export default function Home(): React.ReactElement {
  const { siteConfig } = useDocusaurusContext()
  const history = useHistory()

  return (
    <Layout
      title={`${siteConfig.title} Documentation`}
      description="Documentation for Pulsarr"
      wrapperClassName="home-page-layout"
    >
      <BrowserOnly
        fallback={
          <div
            style={{
              position: 'fixed',
              top: 'var(--ifm-navbar-height)',
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: '#000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#c1666b',
              fontSize: '1.5rem',
              fontFamily: 'Shuttleblock, system-ui, -apple-system, sans-serif',
            }}
          >
            Loading Pulsarr...
          </div>
        }
      >
        {() => {
          const Starfield = require('@/client/components/ui/starfield').default
          const CrtOverlay =
            require('@/client/components/ui/crt-overlay').default
          const Asteroids = require('@/client/components/ui/asteroids').default
          const { AspectRatio } = require('@/client/components/ui/aspect-ratio')
          const { useMediaQuery } = require('@/client/hooks/use-media-query')
          const Pulsar = require('@/client/components/ui/pulsar').default
          const { Button } = require('@/client/components/ui/button')

          const ClientHome = () => {
            const [isHydrated, setIsHydrated] = React.useState(false)
            const isMobile = useMediaQuery('(max-width: 768px)')
            const planetMobileUrl = useBaseUrl('/img/planet-m.webp')
            const planetUrl = useBaseUrl('/img/planet.webp')
            const docsIntroUrl = useBaseUrl('/docs/intro')

            // Ensure proper hydration
            React.useEffect(() => {
              setIsHydrated(true)
            }, [])

            // Fix viewport height and scrolling issues
            useEffect(() => {
              // Fix for any scrolling issues
              document.body.style.overflowX = 'hidden'

              // Set CSS custom property for stable viewport height
              const setVH = () => {
                const vh = window.innerHeight * 0.01
                document.documentElement.style.setProperty('--vh', `${vh}px`)
              }

              setVH()
              window.addEventListener('resize', setVH)
              window.addEventListener('orientationchange', setVH)

              return () => {
                document.body.style.overflowX = ''
                window.removeEventListener('resize', setVH)
                window.removeEventListener('orientationchange', setVH)
              }
            }, [])

            // Show loading state until hydration is complete
            if (!isHydrated) {
              return (
                <div
                  style={{
                    position: 'fixed',
                    top: 'var(--ifm-navbar-height)',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: '#000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#c1666b',
                    fontSize: '1.5rem',
                    fontFamily:
                      'Shuttleblock, system-ui, -apple-system, sans-serif',
                  }}
                >
                  Loading Pulsarr...
                </div>
              )
            }

            return (
              <div style={{ position: 'relative' }}>
                {/* Background layer with text inside Starfield but before CRT overlay */}
                <div
                  style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: 'calc(var(--vh, 1vh) * 100)', // Use stable viewport height
                    zIndex: 1,
                  }}
                >
                  <Starfield>
                    {/* Pulsar - OUTSIDE text container to allow proper z-indexing */}
                    <div
                      style={{
                        position: 'fixed',
                        top: 'calc(50px + 2rem - 18px)', // Text top + padding - pulsar offset
                        left: 'calc(50% + 6rem)', // Text center + approximate text width/2 + offset
                        width: '96px',
                        height: '96px',
                        zIndex: -1, // Behind asteroids
                        pointerEvents: 'none',
                      }}
                    >
                      <Pulsar className="w-24 h-24" />
                    </div>

                    {/* Pulsarr logo and text - with proper z-index ordering */}
                    <div
                      style={{
                        position: 'fixed',
                        top: '50px' /* Moved up from 80px to 50px */,
                        left: '0',
                        right: '0',
                        zIndex: 30,
                        textAlign: 'center',
                        padding: '2rem',
                      }}
                    >
                      {/* Wrapper for title */}
                      <div
                        style={{
                          position: 'relative',
                          display: 'inline-block',
                          marginBottom:
                            '0.25rem' /* Further reduced from 0.5rem to 0.25rem */,
                        }}
                      >
                        <Heading
                          as="h1"
                          style={{
                            color: '#c1666b', // --static-text red color from main app
                            fontSize: '4rem',
                            fontWeight: 'bold',
                            fontFamily:
                              'Shuttleblock, system-ui, -apple-system, sans-serif',
                            textShadow: '3px 3px 0px rgba(0, 0, 0, 0.5)',
                          }}
                        >
                          {siteConfig.title}
                        </Heading>
                      </div>
                      <p
                        id="subtitle"
                        style={{
                          color: '#c1666b', // --static-text red color
                          fontSize: '1.5rem',
                          fontFamily:
                            'Shuttleblock, system-ui, -apple-system, sans-serif',
                          marginTop:
                            '-0.5rem' /* Increased negative margin to pull up more */,
                          marginBottom: '3rem',
                          textShadow: '2px 2px 0px rgba(0, 0, 0, 0.5)',
                        }}
                      >
                        {siteConfig.tagline}
                      </p>
                    </div>

                    {/* Planet Image - CSS-based responsive sizing */}
                    <div
                      className="planet-container"
                      style={{
                        position: 'fixed',
                        bottom: 0,
                        right: 0,
                        zIndex: 2,
                        transform: 'translate(25%, 25%)',
                      }}
                    >
                      <div className="relative planet-sizing">
                        <AspectRatio ratio={1522 / 1608}>
                          <picture>
                            <source
                              media="(max-width: 768px)"
                              srcSet={planetMobileUrl}
                              type="image/webp"
                              width="600"
                              height="634"
                            />
                            <source
                              media="(min-width: 769px)"
                              srcSet={planetUrl}
                              type="image/webp"
                              width="1522"
                              height="1608"
                            />
                            <img
                              src={planetUrl}
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
                    <div style={{ position: 'relative', zIndex: 20 }}>
                      <Asteroids />
                    </div>
                  </Starfield>
                </div>

                {/* CRT overlay on top of everything - separate fixed container */}
                <div
                  style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: 'calc(var(--vh, 1vh) * 100)', // Use stable viewport height
                    zIndex: 20,
                    pointerEvents: 'none',
                  }}
                >
                  <CrtOverlay className="h-full">
                    <div /> {/* Empty div as children */}
                  </CrtOverlay>
                </div>

                {/* Scrollable content */}
                <div
                  style={{
                    position: 'relative',
                    paddingTop: isMobile ? '300px' : '210px', // Increased mobile padding from 220px to 300px
                    zIndex: 100,
                    paddingBottom: '4rem',
                    paddingLeft: '2rem',
                    paddingRight: '2rem',
                    marginBottom: isMobile ? '-700px' : '-210px', // Much more negative margin on mobile
                  }}
                  suppressHydrationWarning
                >
                  <div className="container mx-auto">
                    <DocFeatureExample />
                  </div>

                  {/* Navigation buttons at bottom of content */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingTop: '2.5rem', // 40px - matches mb-10 from cards
                      paddingBottom: '2rem',
                      paddingLeft: '2rem',
                      paddingRight: '2rem',
                    }}
                  >
                    <div
                      className={`flex ${isMobile ? 'flex-col gap-3' : 'gap-6'} justify-center`}
                      suppressHydrationWarning
                    >
                      <Button
                        variant="default"
                        size={isMobile ? 'default' : 'lg'}
                        className="hero-button"
                        onClick={() => history.push(docsIntroUrl)}
                      >
                        Get Started
                      </Button>
                      <Button
                        variant="neutral"
                        size={isMobile ? 'default' : 'lg'}
                        className="hero-button"
                        onClick={() =>
                          window.open(
                            'https://github.com/jamcalli/pulsarr',
                            '_blank',
                          )
                        }
                      >
                        View on GitHub
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )
          }

          return <ClientHome />
        }}
      </BrowserOnly>
    </Layout>
  )
}

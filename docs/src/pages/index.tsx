import React from 'react'
import { useEffect } from 'react'
import { useHistory } from '@docusaurus/router'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'
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
            const isMobile = useMediaQuery('(max-width: 768px)')

            // Simple cleanup effect
            useEffect(() => {
              // Fix for any scrolling issues
              document.body.style.overflowX = 'hidden'

              return () => {
                document.body.style.overflowX = ''
              }
            }, [])

            return (
              <div>
                {/* Background layer with text inside Starfield but before CRT overlay */}
                <div style={{ position: 'fixed', inset: 0 }}>
                  <Starfield>
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
                      {/* Wrapper for title and Pulsar star */}
                      <div
                        style={{
                          position: 'relative',
                          display: 'inline-block',
                          marginBottom:
                            '0.25rem' /* Further reduced from 0.5rem to 0.25rem */,
                        }}
                      >
                        {/* Animated Pulsar component - positioned relative to the text */}
                        <div
                          style={{
                            position: 'absolute',
                            top: '-18px', // Above the text
                            right: '-65px', // To the right of the text
                            width: '96px',
                            height: '96px',
                            zIndex: -5, // Behind asteroids (z-index 20)
                          }}
                        >
                          <Pulsar className="w-24 h-24" />
                        </div>

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

                    {/* Planet Image */}
                    <div className="fixed bottom-0 right-0 z-10 translate-x-1/4 translate-y-1/4">
                      <div
                        className={`relative ${isMobile ? 'w-[600px]' : 'w-[1000px]'}`}
                      >
                        <AspectRatio ratio={1522 / 1608}>
                          <picture>
                            <source
                              media={
                                isMobile
                                  ? '(max-width: 768px)'
                                  : '(min-width: 769px)'
                              }
                              srcSet={
                                isMobile
                                  ? '/img/planet-m.webp'
                                  : '/img/planet.webp'
                              }
                              type="image/webp"
                              width={isMobile ? '600' : '1522'}
                              height={isMobile ? '634' : '1608'}
                            />
                            <img
                              src="/img/planet.webp"
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

                  {/* CRT overlay on top of everything */}
                  <CrtOverlay className="h-full">
                    <div /> {/* Empty div as children */}
                  </CrtOverlay>
                </div>

                {/* Scrollable content - no more mask */}
                <div
                  style={{
                    position: 'relative',
                    paddingTop: '210px', // Same as the original content padding
                    zIndex: 100,
                    paddingBottom: '4rem',
                    paddingLeft: '2rem',
                    paddingRight: '2rem',
                    marginBottom: isMobile ? '-700px' : '-210px', // Much more negative margin on mobile
                  }}
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
                      padding: '2rem',
                      marginTop: '2rem',
                    }}
                  >
                    <div
                      className={`flex ${isMobile ? 'flex-col gap-3' : 'gap-6'} justify-center`}
                    >
                      <Button
                        variant="default"
                        size={isMobile ? 'md' : 'lg'}
                        className="hero-button"
                        onClick={() => history.push('/docs/intro')}
                      >
                        Get Started
                      </Button>
                      <Button
                        variant="neutral"
                        size={isMobile ? 'md' : 'lg'}
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

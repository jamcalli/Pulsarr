import React from 'react'
import { useEffect } from 'react'
import { useHistory } from '@docusaurus/router'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'
import Layout from '@theme/Layout'
import Starfield from '@/client/components/ui/starfield'
import CrtOverlay from '@/client/components/ui/crt-overlay'
import Asteroids from '@/client/components/ui/asteroids'
import { AspectRatio } from '@/client/components/ui/aspect-ratio'
import { useMediaQuery } from '@/client/hooks/use-media-query'
import Pulsar from '@/client/components/ui/pulsar'
import { Button } from '@/client/components/ui/button'
import Heading from '@theme/Heading'
import DocFeatureExample from '../components/DocFeatureExample'

export default function Home(): React.ReactElement {
  const { siteConfig } = useDocusaurusContext()
  const isMobile = useMediaQuery('(max-width: 768px)')
  const history = useHistory()

  // Use JavaScript to calculate the exact subtitle height
  useEffect(() => {
    // Fix for any scrolling issues
    document.body.style.overflowX = 'hidden'

    // Calculate mask height based on subtitle position
    const calculateMaskHeight = () => {
      const subtitle = document.getElementById('subtitle')
      if (subtitle) {
        const subtitleBottom = subtitle.getBoundingClientRect().bottom
        const navbar = document.querySelector('.navbar')
        const navbarHeight = navbar ? navbar.getBoundingClientRect().height : 60

        // Calculate height from navbar to bottom of subtitle plus some extra space
        const extraSpace = 20 // Add 20px of extra space
        const maskHeight = subtitleBottom - navbarHeight + extraSpace

        // Set the mask height and content padding
        const scrollContent = document.getElementById('scroll-content')
        const contentPadding = document.getElementById('content-padding')

        if (scrollContent && contentPadding) {
          // Update the mask and content padding heights
          // Add a slight gradient transition of 10px for smoother masking
          const maskValue = `linear-gradient(to bottom, transparent 0 ${maskHeight - 10}px, black ${maskHeight}px)`
          scrollContent.style.webkitMaskImage = maskValue
          scrollContent.style.maskImage = maskValue

          // Add extra margin at top of content for smoother appearance
          contentPadding.style.paddingTop = `${maskHeight}px`
          contentPadding.style.marginTop = '15px'
        }
      }
    }

    // Initial calculation
    calculateMaskHeight()

    // Recalculate on resize
    window.addEventListener('resize', calculateMaskHeight)

    return () => {
      document.body.style.overflowX = ''
      window.removeEventListener('resize', calculateMaskHeight)
    }
  }, [])

  return (
    <Layout
      title={`${siteConfig.title} Documentation`}
      description="Documentation for Pulsarr"
      wrapperClassName="home-page-layout"
    >
      <div
        style={{
          position: 'fixed',
          top: 'var(--ifm-navbar-height)',
          left: 0,
          right: 0,
          bottom: 0,
          overflow: 'hidden',
        }}
      >
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
                        isMobile ? '(max-width: 768px)' : '(min-width: 769px)'
                      }
                      srcSet={
                        isMobile ? '/img/planet-m.webp' : '/img/planet.webp'
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

        {/* Navigation buttons overlay - above CRT */}
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            padding: '2rem',
          }}
        >
          <div className="flex gap-6 justify-center mb-16">
            <Button
              variant="default"
              size="lg"
              className="hero-button"
              onClick={() => history.push('/docs/intro')}
            >
              Get Started
            </Button>
            <Button
              variant="neutral"
              size="lg"
              className="hero-button"
              onClick={() =>
                window.open('https://github.com/jamcalli/pulsarr', '_blank')
              }
            >
              View on GitHub
            </Button>
          </div>
        </div>
      </div>

      {/* Simple mask container */}
      <div
        style={{
          position: 'fixed',
          top: 'var(--ifm-navbar-height)',
          left: 0,
          right: 0,
          bottom: 0,
          overflow: 'hidden',
        }}
      >
        {/* Scrollable content with mask - dynamic height calculated by JS */}
        <div
          id="scroll-content"
          style={{
            height: '100%',
            overflowY: 'auto',
            WebkitMaskImage:
              'linear-gradient(to bottom, transparent 0 210px, black 210px)' /* Initial value, will be updated by JS */,
            maskImage:
              'linear-gradient(to bottom, transparent 0 210px, black 210px)' /* Initial value, will be updated by JS */,
            paddingRight: '20px' /* Room for scrollbar */,
          }}
        >
          <div
            id="content-padding"
            style={{
              paddingTop: '210px' /* Initial value, will be updated by JS */,
              paddingBottom: '4rem',
              paddingLeft: '2rem',
              paddingRight: '2rem',
            }}
          >
            <div className="container mx-auto">
              <DocFeatureExample />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}

import React from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Starfield from '@/client/components/ui/starfield';
import CrtOverlay from '@/client/components/ui/crt-overlay';
import Asteroids from '@/client/components/ui/asteroids';
import { AspectRatio } from '@/client/components/ui/aspect-ratio';
import { useMediaQuery } from '@/client/hooks/use-media-query';
import planetDesktop from '@/client/assets/images/planet.webp';
import planetMobile from '@/client/assets/images/planet-m.webp';
import Pulsar from '@/client/components/ui/pulsar';
import Heading from '@theme/Heading';

export default function Home(): JSX.Element {
  const {siteConfig} = useDocusaurusContext();
  const isMobile = useMediaQuery('(max-width: 768px)');
  
  return (
    <Layout
      title={`${siteConfig.title} Documentation`}
      description="Documentation for Pulsarr">
      <div style={{ position: 'relative', height: 'calc(100vh - var(--ifm-navbar-height))', overflow: 'hidden' }}>
        {/* Background layer with text inside Starfield but before CRT overlay */}
        <div style={{ position: 'fixed', inset: 0 }}>
          <Starfield>
            {/* Pulsarr logo and text - with proper z-index ordering */}
            <div style={{ 
              position: 'fixed',
              top: '150px',
              left: '0',
              right: '0',
              zIndex: 30,
              textAlign: 'center',
              padding: '2rem'
            }}>
              {/* Wrapper for title and Pulsar star */}
              <div style={{ 
                position: 'relative',
                display: 'inline-block',
                marginBottom: '1rem'
              }}>
                {/* Animated Pulsar component - positioned relative to the text */}
                <div style={{ 
                  position: 'absolute',
                  top: '-18px',  // Above the text
                  right: '-65px', // To the right of the text
                  width: '96px',
                  height: '96px',
                  zIndex: -20  // Behind text, planet, and asteroids
                }}>
                  <Pulsar className="w-24 h-24" />
                </div>
                
                <Heading as="h1" style={{ 
                  color: '#c1666b', // --static-text red color from main app
                  fontSize: '4rem', 
                  fontWeight: 'bold',
                  fontFamily: 'Shuttleblock, system-ui, -apple-system, sans-serif',
                  textShadow: '3px 3px 0px rgba(0, 0, 0, 0.5)'
                }}>
                  {siteConfig.title}
                </Heading>
              </div>
              <p style={{ 
                color: '#c1666b', // --static-text red color
                fontSize: '1.5rem',
                fontFamily: 'Shuttleblock, system-ui, -apple-system, sans-serif',
                marginBottom: '3rem',
                textShadow: '2px 2px 0px rgba(0, 0, 0, 0.5)'
              }}>
                {siteConfig.tagline}
              </p>
            </div>
            
            {/* Planet Image */}
            <div className="fixed bottom-0 right-0 z-10 translate-x-1/4 translate-y-1/4">
              <div className={`relative ${isMobile ? 'w-[600px]' : 'w-[1000px]'}`}>
                <AspectRatio ratio={1522 / 1608}>
                  <picture>
                    <source
                      media={isMobile ? '(max-width: 768px)' : '(min-width: 769px)'}
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
            <div style={{ position: 'relative', zIndex: 20 }}>
              <Asteroids />
            </div>
          </Starfield>
          
          {/* CRT overlay on top of everything */}
          <CrtOverlay className="h-full" />
        </div>
        
        {/* Navigation buttons overlay - above CRT */}
        <div style={{ 
          position: 'relative', 
          zIndex: 100,
          height: '100%',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          padding: '2rem'
        }}>
          <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', marginBottom: '4rem' }}>
            <Link
              className="button button--primary button--lg"
              to="/docs/intro"
              style={{
                backgroundColor: '#48a9a6',
                color: '#000',
                border: '3px solid #000',
                borderRadius: '5px',
                fontFamily: 'Shuttleblock, system-ui, -apple-system, sans-serif',
                fontWeight: '500',
                letterSpacing: '1px',
                textTransform: 'uppercase',
                boxShadow: '4px 4px 0px 0px rgba(0, 0, 0, 0.3)'
              }}>
              Get Started
            </Link>
            <Link
              className="button button--outline button--lg"
              href="https://github.com/jamcalli/pulsarr"
              style={{
                backgroundColor: 'transparent',
                color: '#48a9a6',
                border: '3px solid #48a9a6',
                borderRadius: '5px',
                fontFamily: 'Shuttleblock, system-ui, -apple-system, sans-serif',
                fontWeight: '500',
                letterSpacing: '1px',
                textTransform: 'uppercase',
                boxShadow: '4px 4px 0px 0px rgba(0, 0, 0, 0.3)'
              }}>
              View on GitHub
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
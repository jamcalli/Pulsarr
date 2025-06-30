import React, { useState, useEffect, useRef } from 'react'
import BrowserOnly from '@docusaurus/BrowserOnly'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'

const RetroTerminalContent = () => {
  const { siteConfig } = useDocusaurusContext()
  const version = siteConfig.customFields?.version as string
  const [displayText, setDisplayText] = useState('')
  const [showCursor, setShowCursor] = useState(true)
  const [bootProgress, setBootProgress] = useState(0) // 0 = red, 1 = orange, 2 = green
  const [isSmallScreen, setIsSmallScreen] = useState(false)
  const [isInView, setIsInView] = useState(false)
  const terminalRef = useRef(null)

  const getColorForProgress = (progress) => {
    switch (progress) {
      case 0:
        return '#ff0000' // Red
      case 1:
        return '#ff8800' // Orange
      case 2:
        return '#00ff41' // Green
      default:
        return '#ff0000'
    }
  }

  const fullTextLarge = ` ____  _   _ _     ____    _    ____  ____  
|  _ \\| | | | |   / ___|  / \\  |  _ \\|  _ \\ 
| |_) | | | | |   \\___ \\ / _ \\ | |_) | |_) |
|  __/| |_| | |___ ___) / ___ \\|  _ <|  _ < 
|_|    \\___/|_____|____/_/   \\_\\_| \\_\\_| \\_\\

INITIALIZING WATCHLIST MONITOR...
> DETECTING PLEX CONTENT ADDITIONS
> ROUTING TO SONARR/RADARR INSTANCES  
> DOWNLOADING REQUESTED MEDIA
> NOTIFYING USERS WHEN READY
> CLEANING UNWATCHED CONTENT

SYSTEM STATUS: OPERATIONAL
`

  const fullTextSmall = `
PULSARR v${version}

INITIALIZING WATCHLIST MONITOR...
> DETECTING PLEX CONTENT ADDITIONS
> ROUTING TO SONARR/RADARR INSTANCES  
> DOWNLOADING REQUESTED MEDIA
> NOTIFYING USERS WHEN READY
> CLEANING UNWATCHED CONTENT

SYSTEM STATUS: OPERATIONAL
`

  const fullText = isSmallScreen ? fullTextSmall : fullTextLarge

  // Set up intersection observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsInView(true)
          }
        }
      },
      {
        threshold: 0.1, // Trigger when 10% of the element is visible
      },
    )

    if (terminalRef.current) {
      observer.observe(terminalRef.current)
    }

    return () => {
      if (terminalRef.current) {
        observer.unobserve(terminalRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!isInView) return // Don't start animation until in view

    setDisplayText('') // Reset text when changing size or coming into view
    setBootProgress(0) // Reset progress

    let index = 0
    const typingSpeed = isSmallScreen ? 50 : 30 // Slower on mobile (50ms vs 30ms)

    const timer = setInterval(() => {
      if (index < fullText.length) {
        setDisplayText(fullText.substring(0, index + 1))
        index++

        // Update boot progress based on text progress
        const progress = index / fullText.length
        if (progress < 0.15) {
          setBootProgress(0) // Red
        } else if (progress < 0.4) {
          setBootProgress(1) // Orange
        } else {
          setBootProgress(2) // Green
        }
      } else {
        clearInterval(timer)
      }
    }, typingSpeed)

    return () => clearInterval(timer)
  }, [fullText, isInView, isSmallScreen]) // Re-run when text changes, view state changes, or screen size changes

  useEffect(() => {
    const cursorTimer = setInterval(() => {
      setShowCursor((prev) => !prev)
    }, 500)
    return () => clearInterval(cursorTimer)
  }, [])

  // Detect screen size changes
  useEffect(() => {
    const checkScreenSize = () => {
      setIsSmallScreen(window.innerWidth < 650)
    }

    checkScreenSize() // Check on mount
    window.addEventListener('resize', checkScreenSize)

    return () => window.removeEventListener('resize', checkScreenSize)
  }, [])

  return (
    <>
      <div
        ref={terminalRef}
        className="retro-terminal-screen"
        style={{
          position: 'relative',
          backgroundColor: '#000000 !important', // Force black with !important
          background: '#000000 !important', // Double ensure black background
          borderRadius: '15px', // Original border radius
          overflow: 'hidden',
          boxShadow:
            '0 0 2px 3px rgba(10, 10, 10, 0.7), inset 0 0 20px rgba(0, 0, 0, 0.9)',
          border: `3px solid ${getColorForProgress(bootProgress)}33`,
          transition: 'border-color 0.3s ease',
          height: '415px', // Mid-height between 380px and 450px
        }}
      >
        {/* Screen reflection/glare */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: `
            radial-gradient(
              ellipse at 30% 30%,
              rgba(255, 255, 255, 0.05) 0%,
              transparent 40%
            )
          `,
            pointerEvents: 'none',
            zIndex: 200,
          }}
        />

        {/* Vignette effect */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: `
            radial-gradient(
              ellipse at center,
              transparent 0%,
              transparent 60%,
              rgba(0, 0, 0, 0.4) 100%
            )
          `,
            pointerEvents: 'none',
            zIndex: 150,
          }}
        />

        {/* Phosphor glow layer */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: `radial-gradient(ellipse at center, ${getColorForProgress(bootProgress)}08 0%, transparent 70%)`,
            animation: 'glow 2s ease-in-out infinite',
            pointerEvents: 'none',
            zIndex: 90,
            transition: 'background 0.3s ease',
          }}
        />

        {/* Interlace lines */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: `
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 2px,
              ${getColorForProgress(bootProgress)}08 2px,
              ${getColorForProgress(bootProgress)}08 4px
            )
          `,
            pointerEvents: 'none',
            zIndex: 110,
            transition: 'background 0.3s ease',
          }}
        />

        {/* Moving scan line */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '100px',
            background: `linear-gradient(
            to bottom,
            transparent 0%,
            ${getColorForProgress(bootProgress)}0A 50%,
            transparent 100%
          )`,
            animation: 'scanline 8s linear infinite',
            pointerEvents: 'none',
            zIndex: 100,
            transition: 'background 0.3s ease',
          }}
        />

        {/* Flicker effect */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: `${getColorForProgress(bootProgress)}02`,
            animation: 'flicker 0.15s infinite',
            pointerEvents: 'none',
            zIndex: 95,
            transition: 'background 0.3s ease',
          }}
        />

        {/* Terminal content wrapper with envelope distortion */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            padding: '30px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Terminal header */}
          <div
            style={{
              borderBottom: `2px solid ${getColorForProgress(bootProgress)}`,
              paddingBottom: '10px',
              marginBottom: '15px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              transition: 'border-color 0.3s ease',
            }}
          >
            <div
              className="status-indicator"
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor:
                  bootProgress >= 0 ? '#ff0000' : 'rgba(255, 0, 0, 0.3)',
                boxShadow: bootProgress >= 0 ? '0 0 10px #ff0000' : 'none',
                transition: 'all 0.3s ease',
                zIndex: 300,
                position: 'relative',
              }}
            />
            <div
              className="status-indicator"
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor:
                  bootProgress >= 1 ? '#ff8800' : 'rgba(255, 136, 0, 0.3)',
                boxShadow: bootProgress >= 1 ? '0 0 10px #ff8800' : 'none',
                transition: 'all 0.3s ease',
                zIndex: 300,
                position: 'relative',
              }}
            />
            <div
              className="status-indicator"
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor:
                  bootProgress >= 2 ? '#00ff41' : 'rgba(0, 255, 65, 0.3)',
                boxShadow: bootProgress >= 2 ? '0 0 10px #00ff41' : 'none',
                transition: 'all 0.3s ease',
                zIndex: 300,
                position: 'relative',
              }}
            />
            <span
              style={{
                marginLeft: 'auto',
                fontSize: '12px',
                opacity: 0.8,
                color: getColorForProgress(bootProgress),
                textShadow: `0 0 5px ${getColorForProgress(bootProgress)}CC`,
                fontFamily: 'Courier New, monospace',
                transition: 'color 0.3s ease, text-shadow 0.3s ease',
              }}
            >
              PULSARR TERMINAL v{version}
            </span>
          </div>

          {/* Terminal text container with fixed dimensions */}
          <div
            style={{
              flex: 1,
              overflow: 'hidden',
              transform: 'perspective(1000px) rotateX(0.5deg)',
              animation: 'pulse 4s ease-in-out infinite',
            }}
          >
            {/* Terminal text content */}
            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                textShadow: `0 0 5px ${getColorForProgress(bootProgress)}CC`,
                color: getColorForProgress(bootProgress),
                fontFamily: 'Courier New, monospace',
                fontSize: '14px',
                lineHeight: '1.4',
                animation: 'textBlur 3s ease-in-out infinite',
                transition: 'color 0.3s ease, text-shadow 0.3s ease',
                height: '100%',
                overflow: 'hidden',
              }}
            >
              {displayText}
              {showCursor && (
                <span
                  style={{
                    backgroundColor: getColorForProgress(bootProgress),
                    color: '#0a0a0a',
                    padding: '0 2px',
                    animation: 'blink 1s step-start infinite',
                    display: 'inline-block',
                    minWidth: '10px',
                    minHeight: '1.4em',
                  }}
                >
                  _
                </span>
              )}
            </pre>
          </div>
        </div>

        <style>{`
        /* Force black background in all themes */
        .retro-terminal-screen {
          background-color: #000000 !important;
          background: #000000 !important;
        }
        
        /* Additional specificity for Docusaurus themes */
        [data-theme='light'] .retro-terminal-screen,
        [data-theme='dark'] .retro-terminal-screen,
        html[data-theme='light'] .retro-terminal-screen,
        html[data-theme='dark'] .retro-terminal-screen {
          background-color: #000000 !important;
          background: #000000 !important;
        }
        
        /* Force all child divs to maintain black background */
        .retro-terminal-screen *:not(.status-indicator) {
          background-color: transparent !important;
        }
        
        /* Ensure the screen itself stays black */
        .retro-terminal-screen > div {
          background-color: transparent !important;
        }
        
        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(1000%); }
        }
        
        @keyframes flicker {
          0% { opacity: 0.27861; }
          5% { opacity: 0.34769; }
          10% { opacity: 0.23604; }
          15% { opacity: 0.90626; }
          20% { opacity: 0.18128; }
          25% { opacity: 0.83891; }
          30% { opacity: 0.65583; }
          35% { opacity: 0.67807; }
          40% { opacity: 0.26559; }
          45% { opacity: 0.84693; }
          50% { opacity: 0.96019; }
          55% { opacity: 0.08594; }
          60% { opacity: 0.20313; }
          65% { opacity: 0.71988; }
          70% { opacity: 0.53455; }
          75% { opacity: 0.37288; }
          80% { opacity: 0.71428; }
          85% { opacity: 0.70419; }
          90% { opacity: 0.7003; }
          95% { opacity: 0.36108; }
          100% { opacity: 0.24387; }
        }
        
        @keyframes glow {
          0% { opacity: 1; }
          50% { opacity: 1.2; }
          100% { opacity: 1; }
        }
        
        @keyframes pulse {
          0% { transform: perspective(1000px) rotateX(0.5deg) scale(1); }
          50% { transform: perspective(1000px) rotateX(0.5deg) scale(1.002); }
          100% { transform: perspective(1000px) rotateX(0.5deg) scale(1); }
        }
        
        @keyframes textBlur {
          0% { filter: blur(0px); }
          50% { filter: blur(0.3px); }
          100% { filter: blur(0px); }
        }
        
        @keyframes blink {
          50% { opacity: 0; }
        }
      `}</style>
      </div>
    </>
  )
}

const RetroTerminal = () => {
  return (
    <BrowserOnly
      fallback={
        <div className="border border-gray-300 grid w-full max-w-6xl grid-cols-1 rounded-lg shadow-lg">
          <main className="flex flex-col font-semibold p-6 bg-white dark:bg-gray-900 min-h-[200px]">
            <div className="flex-1">Loading Terminal...</div>
          </main>
        </div>
      }
    >
      {() => {
        const ClientRetroTerminal = () => {
          const [windowWidth, setWindowWidth] = React.useState(
            typeof window !== 'undefined' ? window.innerWidth : 1024,
          )

          React.useEffect(() => {
            const handleResize = () => {
              setWindowWidth(window.innerWidth)
            }

            window.addEventListener('resize', handleResize)
            return () => window.removeEventListener('resize', handleResize)
          }, [])

          return (
            <div
              className={`outline-border dark:outline-darkBorder w-full h-full
                rounded-base shadow-[10px_10px_0_0_#000] outline outline-4`}
              style={{
                minWidth: windowWidth >= 768 ? '523px' : 'auto', // 475px content + 48px padding
              }}
            >
              {/* Main content area - no header, just the body */}
              <main className="flex flex-col font-semibold p-6 rounded-base bg-background">
                <div className="flex-1">
                  <RetroTerminalContent />
                </div>
              </main>
            </div>
          )
        }

        return <ClientRetroTerminal />
      }}
    </BrowserOnly>
  )
}

export default RetroTerminal

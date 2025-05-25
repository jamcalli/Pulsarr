import { useState, useEffect } from 'react'
import BrowserOnly from '@docusaurus/BrowserOnly'
import useBaseUrl from '@docusaurus/useBaseUrl'

const WorkflowSequence = () => {
  const [currentStep, setCurrentStep] = useState(0)
  const [key, setKey] = useState(0)

  const steps = [
    {
      type: 'gif',
      src: useBaseUrl('/gifs/Plex-Grab.gif'),
      alt: 'Plex Grab workflow',
      caption: 'Add content to Plex watchlist',
    },
    {
      type: 'gif',
      src: useBaseUrl('/gifs/Import.gif'),
      alt: 'Import workflow',
      caption: 'Content is automatically imported',
    },
    {
      type: 'image',
      src: useBaseUrl('/img/Discord-Notification.png'),
      alt: 'Discord Notification',
      caption: 'Get notified when your content is ready',
    },
  ]

  useEffect(() => {
    let timer: NodeJS.Timeout

    if (currentStep === 0) {
      // First GIF (Plex-Grab) - show for 4 seconds
      timer = setTimeout(() => {
        setCurrentStep(1)
      }, 4000)
    } else if (currentStep === 1) {
      // Second GIF (Import) - show for 5 seconds
      timer = setTimeout(() => {
        setCurrentStep(2)
      }, 5000)
    } else {
      // Static image (Discord Notification) - show for 5 seconds then restart
      timer = setTimeout(() => {
        setCurrentStep(0)
        setKey((prev) => prev + 1) // Force re-render to restart GIFs
      }, 5000)
    }

    return () => clearTimeout(timer)
  }, [currentStep])

  const currentAsset = steps[currentStep]

  return (
    <BrowserOnly fallback={<div>Loading workflow...</div>}>
      {() => (
        <div className="flex flex-col justify-between h-full overflow-hidden">
          {/* Content area */}
          <div
            className="flex flex-col"
            style={{ height: 'calc(100% - 15px)' }}
          >
            {/* Media container - all content gets the same dark background */}
            <div className="bg-[#1a1a1a] rounded-lg h-[85%] flex items-center justify-center overflow-hidden">
              {currentAsset.type === 'gif' ? (
                <img
                  key={`${currentStep}-${key}`}
                  src={currentAsset.src}
                  alt={currentAsset.alt}
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <div className="flex w-full h-full">
                  {/* Left text */}
                  <div className="flex-1 p-4 flex items-center justify-center">
                    <p
                      className="text-text text-center text-sm"
                      style={{ color: '#c1666b' }}
                    >
                      Personalized notifications the second your content is
                      ready.
                    </p>
                  </div>

                  {/* Right image */}
                  <div className="flex-1 p-2 flex items-center justify-center">
                    <img
                      src={currentAsset.src}
                      alt={currentAsset.alt}
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Caption */}
            <p className="text-text text-center mt-1 mb-1 text-sm truncate px-2">
              {currentAsset.caption}
            </p>
          </div>

          {/* Indicators */}
          <div className="flex justify-center gap-2">
            {steps.map((step, index) => (
              <div
                key={`indicator-${step.type}-${step.alt}-${index}`}
                className="w-1.5 h-1.5 rounded-full transition-colors"
                style={{
                  backgroundColor:
                    index === currentStep
                      ? '#c1666b'
                      : 'rgba(255, 255, 255, 0.5)',
                }}
              />
            ))}
          </div>
        </div>
      )}
    </BrowserOnly>
  )
}

export default function WorkflowCard() {
  return (
    <BrowserOnly>
      {() => {
        return (
          <div
            className="outline-border dark:outline-darkBorder bg-bg rounded-base shadow-[10px_10px_0_0_#000] outline outline-4 p-4 h-[300px] lg:h-full"
            style={{
              overflow: 'hidden',
            }}
          >
            <div className="w-full h-full">
              <WorkflowSequence />
            </div>
          </div>
        )
      }}
    </BrowserOnly>
  )
}

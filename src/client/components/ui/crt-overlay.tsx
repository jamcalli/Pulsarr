import type React from 'react'
import { useEffect, useRef } from 'react'
import { usePageVisibility } from '@/hooks/use-page-visibility'

interface CRTOverlayProps {
  children: React.ReactNode
  className?: string
  intensity?: 'light' | 'medium' | 'heavy'
}

const intensitySettings = {
  light: { scanlineOpacity: 0.1, rgbOffset: 0.03 },
  medium: { scanlineOpacity: 0.25, rgbOffset: 0.06 },
  heavy: { scanlineOpacity: 0.4, rgbOffset: 0.09 },
}

// hardFlicker: 0.16s cycle, 3 discrete steps
const HARD_STEPS = [1.0, 0.92, 0.85]
const HARD_PERIOD = 160
// softFlicker: 2s smooth cycle, opacity 0.1 → 0.15
const SOFT_PERIOD = 2000
const FRAME_INTERVAL = 1000 / 20

function createPatternCanvas(
  width: number,
  height: number,
  dpr: number,
  scanlineOpacity: number,
  rgbOffset: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width * dpr
  canvas.height = height * dpr
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.scale(dpr, dpr)

  // Draw RGB vertical strips
  const colors = [
    `rgba(255, 0, 0, ${rgbOffset})`,
    `rgba(0, 255, 0, ${rgbOffset * 0.33})`,
    `rgba(0, 0, 255, ${rgbOffset})`,
  ]
  for (let col = 0; col < 3; col++) {
    ctx.fillStyle = colors[col]
    for (let x = col; x < width; x += 3) {
      ctx.fillRect(x, 0, 1, height)
    }
  }

  // Draw scanlines (every other row darkened)
  ctx.fillStyle = `rgba(0, 0, 0, ${scanlineOpacity})`
  ctx.beginPath()
  for (let y = 1; y < height; y += 2) {
    ctx.rect(0, y, width, 1)
  }
  ctx.fill()

  return canvas
}

const CRTOverlay = ({
  children,
  className = '',
  intensity = 'medium',
}: CRTOverlayProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const patternRef = useRef<HTMLCanvasElement | null>(null)
  const animFrameRef = useRef<number>(0)
  const lastFrameRef = useRef<number>(0)
  const isPageVisible = usePageVisibility()

  const settings = intensitySettings[intensity]

  // Build/rebuild pattern on mount and resize
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const setupCanvas = () => {
      const dpr = window.devicePixelRatio || 1
      const width = window.innerWidth
      const height = window.innerHeight

      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`

      patternRef.current = createPatternCanvas(
        width,
        height,
        dpr,
        settings.scanlineOpacity,
        settings.rgbOffset,
      )
    }

    setupCanvas()
    window.addEventListener('resize', setupCanvas)
    return () => window.removeEventListener('resize', setupCanvas)
  }, [settings.scanlineOpacity, settings.rgbOffset])

  // Animation loop
  useEffect(() => {
    if (!isPageVisible) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
        animFrameRef.current = 0
      }
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    lastFrameRef.current = 0

    const loop = (timestamp: number) => {
      if (lastFrameRef.current === 0) {
        lastFrameRef.current = timestamp
        animFrameRef.current = requestAnimationFrame(loop)
        return
      }

      if (timestamp - lastFrameRef.current < FRAME_INTERVAL) {
        animFrameRef.current = requestAnimationFrame(loop)
        return
      }
      lastFrameRef.current = timestamp

      const pattern = patternRef.current
      if (!pattern) {
        animFrameRef.current = requestAnimationFrame(loop)
        return
      }

      const dpr = window.devicePixelRatio || 1
      const width = canvas.width / dpr
      const height = canvas.height / dpr

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      // Hard flicker: 3 discrete opacity steps over 0.16s
      const hardStep = Math.floor(
        ((timestamp % HARD_PERIOD) / HARD_PERIOD) * 3,
      )
      ctx.globalAlpha = HARD_STEPS[hardStep]
      ctx.drawImage(pattern, 0, 0, width, height)

      // Soft flicker: smooth 0.1 → 0.15 over 2s
      const softPhase = (timestamp % SOFT_PERIOD) / SOFT_PERIOD
      const softOpacity =
        0.1 + 0.05 * (0.5 - 0.5 * Math.cos(softPhase * Math.PI * 2))
      ctx.globalAlpha = softOpacity
      ctx.fillStyle = 'black'
      ctx.fillRect(0, 0, width, height)

      ctx.globalAlpha = 1
      animFrameRef.current = requestAnimationFrame(loop)
    }

    animFrameRef.current = requestAnimationFrame(loop)

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
        animFrameRef.current = 0
      }
    }
  }, [isPageVisible])

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {children}
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0"
        style={{ zIndex: 20 }}
      />
    </div>
  )
}

export default CRTOverlay

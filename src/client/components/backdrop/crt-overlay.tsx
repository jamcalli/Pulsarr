import type React from 'react'
import { useEffect, useRef } from 'react'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { usePageVisibility } from '@/hooks/usePageVisibility'
import {
  layoutViewport,
  sameViewport,
  type ViewportSize,
} from '@/lib/layout-viewport'

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

const SOFT_PERIOD = 2000
const STATIC_SOFT_OPACITY = 0.125
const FRAME_INTERVAL = 1000 / 20

function softOpacityAt(timestamp: number): number {
  const phase = (timestamp % SOFT_PERIOD) / SOFT_PERIOD
  return 0.1 + 0.05 * (0.5 - 0.5 * Math.cos(phase * Math.PI * 2))
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  pattern: HTMLCanvasElement,
  width: number,
  height: number,
  softOpacity: number,
) {
  const dpr = window.devicePixelRatio || 1
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)

  ctx.globalAlpha = 1
  ctx.drawImage(pattern, 0, 0, width, height)

  ctx.globalAlpha = softOpacity
  ctx.fillStyle = 'black'
  ctx.fillRect(0, 0, width, height)

  ctx.globalAlpha = 1
}

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
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

  const settings = intensitySettings[intensity]

  // Build/rebuild pattern on mount and resize
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let drawn: ViewportSize | null = null
    const setupCanvas = () => {
      const size = layoutViewport()
      if (sameViewport(drawn, size)) return
      drawn = size

      const dpr = window.devicePixelRatio || 1
      const { width, height } = size

      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`

      const pattern = createPatternCanvas(
        width,
        height,
        dpr,
        settings.scanlineOpacity,
        settings.rgbOffset,
      )
      patternRef.current = pattern

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      drawFrame(
        ctx,
        pattern,
        width,
        height,
        prefersReducedMotion
          ? STATIC_SOFT_OPACITY
          : softOpacityAt(performance.now()),
      )
    }

    setupCanvas()
    window.addEventListener('resize', setupCanvas)
    return () => window.removeEventListener('resize', setupCanvas)
  }, [settings.scanlineOpacity, settings.rgbOffset, prefersReducedMotion])

  // Animation loop
  useEffect(() => {
    if (!isPageVisible || prefersReducedMotion) {
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
      drawFrame(
        ctx,
        pattern,
        canvas.width / dpr,
        canvas.height / dpr,
        softOpacityAt(timestamp),
      )
      animFrameRef.current = requestAnimationFrame(loop)
    }

    animFrameRef.current = requestAnimationFrame(loop)

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
        animFrameRef.current = 0
      }
    }
  }, [isPageVisible, prefersReducedMotion])

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

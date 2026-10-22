import type React from 'react'
import { useEffect, useRef } from 'react'
import {
  layoutViewport,
  sameViewport,
  type ViewportSize,
} from '@/lib/layout-viewport'

interface Star {
  xRatio: number
  yRatio: number
  size: number
  opacity: number
}

const STAR_COUNT = 140

function generateStars(count: number): Star[] {
  return Array.from({ length: count }, () => ({
    xRatio: Math.random(),
    yRatio: Math.random(),
    size: Math.random() * 2.5 + 1,
    opacity: Math.random() * 0.5 + 0.2,
  }))
}

function drawStars(
  canvas: HTMLCanvasElement,
  stars: Star[],
  { width, height, dpr }: ViewportSize,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  canvas.width = width * dpr
  canvas.height = height * dpr
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  ctx.scale(dpr, dpr)

  ctx.clearRect(0, 0, width, height)

  for (const star of stars) {
    ctx.globalAlpha = star.opacity
    ctx.fillStyle = 'white'
    ctx.beginPath()
    ctx.arc(
      star.xRatio * width,
      star.yRatio * height,
      star.size / 2,
      0,
      Math.PI * 2,
    )
    ctx.fill()
  }

  ctx.globalAlpha = 1
}

const ParallaxStarfield = ({ children }: { children: React.ReactNode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const starsRef = useRef<Star[] | null>(null)

  if (!starsRef.current) {
    starsRef.current = generateStars(STAR_COUNT)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const stars = starsRef.current
    if (!canvas || !stars) return

    let drawn: ViewportSize | null = null
    const handleResize = () => {
      const size = layoutViewport()
      if (sameViewport(drawn, size)) return
      drawn = size
      drawStars(canvas, stars, size)
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div
      className="fixed inset-0 overflow-hidden pointer-events-none"
      style={{ backgroundColor: 'var(--color-static-space)' }}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
      <div className="relative z-10">{children}</div>
    </div>
  )
}

export default ParallaxStarfield

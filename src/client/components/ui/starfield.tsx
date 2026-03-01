import type React from 'react'
import { useEffect, useRef } from 'react'

const STAR_COUNT = 140

function drawStars(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const width = window.innerWidth
  const height = window.innerHeight

  canvas.width = width * dpr
  canvas.height = height * dpr
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  ctx.scale(dpr, dpr)

  ctx.clearRect(0, 0, width, height)

  for (let i = 0; i < STAR_COUNT; i++) {
    const x = Math.random() * width
    const y = Math.random() * height
    const size = Math.random() * 2.5 + 1
    const opacity = Math.random() * 0.5 + 0.2

    ctx.globalAlpha = opacity
    ctx.fillStyle = 'white'
    ctx.beginPath()
    ctx.arc(x, y, size / 2, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.globalAlpha = 1
}

const ParallaxStarfield = ({ children }: { children: React.ReactNode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    drawStars(canvas)

    const handleResize = () => drawStars(canvas)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div
      className="fixed inset-0 overflow-hidden pointer-events-none"
      style={{ backgroundColor: 'var(--color-secondary-black)' }}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
      <div className="relative z-10">{children}</div>
    </div>
  )
}

export default ParallaxStarfield

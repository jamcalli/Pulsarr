import { useEffect, useRef } from 'react'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { usePageVisibility } from '@/hooks/usePageVisibility'

const DESIGN_SIZE = 400
const CENTER = DESIGN_SIZE / 2
const GLOW_RADIUS = 80
const CONE_HALF_HEIGHT = 100
const BLUR = 2
const FRAME_INTERVAL = 1000 / 30
const PULSE_PERIOD = 2
const ROTATION_PERIOD = 4

function createGlowGradient(ctx: CanvasRenderingContext2D): CanvasGradient {
  const glow = ctx.createRadialGradient(
    CENTER,
    CENTER,
    0,
    CENTER,
    CENTER,
    GLOW_RADIUS,
  )
  glow.addColorStop(0, 'rgba(255, 255, 255, 0.8)')
  glow.addColorStop(0.4, 'rgba(160, 195, 255, 0.4)')
  glow.addColorStop(1, 'rgba(11, 27, 61, 0)')
  return glow
}

function fillCone(
  ctx: CanvasRenderingContext2D,
  gradient: CanvasGradient,
  edgeY: number,
) {
  ctx.beginPath()
  ctx.moveTo(198, CENTER)
  ctx.lineTo(202, CENTER)
  ctx.lineTo(240, edgeY)
  ctx.lineTo(160, edgeY)
  ctx.closePath()

  // Path is fixed before scaling so only the gradient stretches into the bbox ellipse.
  ctx.save()
  ctx.translate(CENTER, (CENTER + edgeY) / 2)
  ctx.scale(40, CONE_HALF_HEIGHT)
  ctx.fillStyle = gradient
  ctx.fill()
  ctx.restore()
}

// The beams only ever rotate, so they are blurred once per size and drawn as a sprite.
function createBeamSprite(scale: number, dpr: number): HTMLCanvasElement {
  const sprite = document.createElement('canvas')
  const pixels = Math.max(1, Math.round(DESIGN_SIZE * scale * dpr))
  sprite.width = pixels
  sprite.height = pixels
  const ctx = sprite.getContext('2d')
  if (!ctx) return sprite

  ctx.scale(pixels / DESIGN_SIZE, pixels / DESIGN_SIZE)
  ctx.filter = `blur(${BLUR}px)`

  const beam = ctx.createLinearGradient(198, 0, 202, 0)
  beam.addColorStop(0, 'rgba(255, 255, 255, 0)')
  beam.addColorStop(0.45, 'rgba(255, 255, 255, 0.8)')
  beam.addColorStop(0.55, 'rgba(255, 255, 255, 0.8)')
  beam.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = beam
  ctx.fillRect(198, 0, 4, DESIGN_SIZE)

  const cone = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
  cone.addColorStop(0, 'rgba(255, 255, 255, 0.4)')
  cone.addColorStop(1, 'rgba(255, 255, 255, 0)')
  fillCone(ctx, cone, 0)
  fillCone(ctx, cone, DESIGN_SIZE)

  return sprite
}

function drawPulsar(
  ctx: CanvasRenderingContext2D,
  glow: CanvasGradient,
  beams: HTMLCanvasElement,
  width: number,
  height: number,
  rotation: number,
  pulse: number,
) {
  const dpr = window.devicePixelRatio || 1
  const scale = Math.min(width, height) / DESIGN_SIZE

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.translate(
    (width - DESIGN_SIZE * scale) / 2,
    (height - DESIGN_SIZE * scale) / 2,
  )
  ctx.scale(scale, scale)

  ctx.globalAlpha = 0.8 + 0.2 * pulse
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(CENTER, CENTER, GLOW_RADIUS, 0, Math.PI * 2)
  ctx.fill()

  ctx.globalAlpha = 1
  ctx.fillStyle = 'white'
  ctx.beginPath()
  ctx.arc(CENTER, CENTER, 20 + 2 * pulse, 0, Math.PI * 2)
  ctx.fill()

  ctx.translate(CENTER, CENTER)
  ctx.rotate(rotation)
  ctx.drawImage(beams, -CENTER, -CENTER, DESIGN_SIZE, DESIGN_SIZE)
}

const Pulsar = ({ className = 'w-96 h-96' }: { className?: string }) => {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isPageVisible = usePageVisibility()
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

  useEffect(() => {
    const wrapper = wrapperRef.current
    const canvas = canvasRef.current
    if (!wrapper || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const glow = createGlowGradient(ctx)
    const animate = isPageVisible && !prefersReducedMotion
    let width = 0
    let height = 0
    let beams = createBeamSprite(0, 1)
    let animationFrame = 0
    let lastUpdate = 0

    const drawAt = (seconds: number) => {
      if (!animate) {
        drawPulsar(ctx, glow, beams, width, height, 0, 1)
        return
      }
      const rotation = (seconds / ROTATION_PERIOD) * Math.PI * 2
      const pulse = (1 - Math.cos((seconds / PULSE_PERIOD) * Math.PI * 2)) / 2
      drawPulsar(ctx, glow, beams, width, height, rotation, pulse)
    }

    const observer = new ResizeObserver(() => {
      const rect = wrapper.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      width = rect.width
      height = rect.height
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      beams = createBeamSprite(Math.min(width, height) / DESIGN_SIZE, dpr)
      drawAt(performance.now() / 1000)
    })
    observer.observe(wrapper)

    const loop = (timestamp: number) => {
      animationFrame = requestAnimationFrame(loop)
      if (timestamp - lastUpdate < FRAME_INTERVAL) return
      lastUpdate = timestamp
      drawAt(timestamp / 1000)
    }

    if (animate) {
      animationFrame = requestAnimationFrame(loop)
    }

    return () => {
      observer.disconnect()
      cancelAnimationFrame(animationFrame)
    }
  }, [isPageVisible, prefersReducedMotion])

  return (
    <div ref={wrapperRef} aria-hidden="true" className={className}>
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  )
}

export default Pulsar

import { useEffect, useRef } from 'react'
import { usePageVisibility } from '@/hooks/use-page-visibility'

interface AsteroidShape {
  radius: number
  vertices: { x: number; y: number }[]
  rotationSpeed: number
}

interface AsteroidState {
  x: number
  y: number
  dx: number
  dy: number
  angle: number
}

const START_ASTEROID_RADIUS = 125
const MIN_ASTEROID_RADIUS = 30
const ASTEROID_VELOCITY = 20
const NUM_ASTEROIDS = 8
const FRAME_INTERVAL = 1000 / 30
const ROTATION_SPEED = 360 / 32
const STROKE_WIDTH = 4

function generateVertices(radius: number): { x: number; y: number }[] {
  const corners = 5 + Math.floor(radius / 8)
  const vertices: { x: number; y: number }[] = []

  for (let i = 0; i < corners; i++) {
    const angle = (i * 360) / corners
    const distance = radius * 0.33 * (2 + Math.random())
    vertices.push({
      x: distance * Math.cos((angle * Math.PI) / 180),
      y: distance * Math.sin((angle * Math.PI) / 180),
    })
  }

  return vertices
}

function createAsteroidShape(): AsteroidShape {
  const radius =
    MIN_ASTEROID_RADIUS +
    Math.random() * (START_ASTEROID_RADIUS - MIN_ASTEROID_RADIUS)
  return {
    radius,
    vertices: generateVertices(radius),
    rotationSpeed: ROTATION_SPEED * (Math.random() > 0.5 ? 1 : -1),
  }
}

function createAsteroidState(): AsteroidState {
  const width = window.innerWidth
  const height = window.innerHeight
  const angle = Math.random() * 360
  const speed =
    ASTEROID_VELOCITY *
    (Math.random() * 0.5 + 0.5) *
    (Math.random() > 0.5 ? 1 : -1)
  const dx = speed * Math.cos((angle * Math.PI) / 180)
  const dy = speed * Math.sin((angle * Math.PI) / 180)

  let x = 0
  let y = 0
  const edge = Math.floor(Math.random() * 4)

  switch (edge) {
    case 0:
      x = Math.random() * width
      break
    case 1:
      x = width
      y = Math.random() * height
      break
    case 2:
      x = Math.random() * width
      y = height
      break
    case 3:
      y = Math.random() * height
      break
  }

  return { x, y, dx, dy, angle: Math.random() * 360 }
}

function drawAsteroid(
  ctx: CanvasRenderingContext2D,
  shape: AsteroidShape,
  state: AsteroidState,
) {
  const { vertices } = shape
  const rad = (state.angle * Math.PI) / 180

  ctx.save()
  ctx.translate(state.x + shape.radius, state.y + shape.radius)
  ctx.rotate(rad)

  ctx.beginPath()
  ctx.moveTo(vertices[0].x, vertices[0].y)
  for (let i = 1; i < vertices.length; i++) {
    ctx.lineTo(vertices[i].x, vertices[i].y)
  }
  ctx.closePath()

  ctx.fillStyle = '#948d89'
  ctx.fill()
  ctx.strokeStyle = '#dedede'
  ctx.lineWidth = STROKE_WIDTH
  ctx.stroke()

  ctx.restore()
}

const FallingAsteroids = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const shapesRef = useRef<AsteroidShape[]>([])
  const statesRef = useRef<AsteroidState[]>([])
  const animationFrameRef = useRef<number>(0)
  const lastUpdateRef = useRef<number>(0)
  const isPageVisible = usePageVisibility()

  if (shapesRef.current.length === 0) {
    shapesRef.current = Array.from({ length: NUM_ASTEROIDS }, () =>
      createAsteroidShape(),
    )
    statesRef.current = shapesRef.current.map(() => createAsteroidState())
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
    }

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [])

  useEffect(() => {
    if (!isPageVisible) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = 0
      }
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    lastUpdateRef.current = 0

    const shapes = shapesRef.current
    const states = statesRef.current

    const gameLoop = (timestamp: number) => {
      if (lastUpdateRef.current === 0) {
        lastUpdateRef.current = timestamp
        animationFrameRef.current = requestAnimationFrame(gameLoop)
        return
      }

      const elapsed = timestamp - lastUpdateRef.current
      if (elapsed < FRAME_INTERVAL) {
        animationFrameRef.current = requestAnimationFrame(gameLoop)
        return
      }

      const deltaTime = elapsed / 1000
      lastUpdateRef.current = timestamp

      const dpr = window.devicePixelRatio || 1
      const width = window.innerWidth
      const height = window.innerHeight

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      for (let i = 0; i < states.length; i++) {
        const state = states[i]
        const fullSize = shapes[i].radius * 2
        let newX = state.x + state.dx * deltaTime
        let newY = state.y + state.dy * deltaTime

        if (newX > width + fullSize) newX = -fullSize
        else if (newX < -fullSize) newX = width
        if (newY > height + fullSize) newY = -fullSize
        else if (newY < -fullSize) newY = height

        state.x = newX
        state.y = newY
        state.angle += shapes[i].rotationSpeed * deltaTime

        drawAsteroid(ctx, shapes[i], state)
      }

      animationFrameRef.current = requestAnimationFrame(gameLoop)
    }

    animationFrameRef.current = requestAnimationFrame(gameLoop)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = 0
      }
    }
  }, [isPageVisible])

  return (
    <div className="fixed inset-0 pointer-events-none z-1">
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  )
}

export default FallingAsteroids

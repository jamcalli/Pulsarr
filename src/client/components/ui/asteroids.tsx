import { useCallback, useEffect, useMemo, useRef } from 'react'
import { usePageVisibility } from '@/hooks/use-page-visibility'

interface AsteroidShape {
  radius: number
  points: string
  rotationDuration: string
  rotationDirection: string
}

interface AsteroidPosition {
  x: number
  y: number
  dx: number
  dy: number
}

const START_ASTEROID_RADIUS = 125
const MIN_ASTEROID_RADIUS = 30
const ASTEROID_VELOCITY = 20
const NUM_ASTEROIDS = 8

function generateAsteroidPoints(radius: number): string {
  const corners = 5 + Math.floor(radius / 8)
  const points: string[] = []

  for (let i = 0; i < corners; i++) {
    const angle = (i * 360) / corners
    const distance = radius * 0.33 * (2 + Math.random())
    const px = radius + distance * Math.cos((angle * Math.PI) / 180)
    const py = radius + distance * Math.sin((angle * Math.PI) / 180)
    points.push(`${px},${py}`)
  }

  return points.join(' ')
}

function createAsteroidShape(): AsteroidShape {
  const radius =
    MIN_ASTEROID_RADIUS +
    Math.random() * (START_ASTEROID_RADIUS - MIN_ASTEROID_RADIUS)
  return {
    radius,
    points: generateAsteroidPoints(radius),
    rotationDuration: '32s',
    rotationDirection: Math.random() > 0.5 ? 'normal' : 'reverse',
  }
}

function createAsteroidPosition(): AsteroidPosition {
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

  return { x, y, dx, dy }
}

const FallingAsteroids = () => {
  const shapes = useMemo(
    () => Array.from({ length: NUM_ASTEROIDS }, () => createAsteroidShape()),
    [],
  )

  const positionsRef = useRef<AsteroidPosition[]>(
    shapes.map(() => createAsteroidPosition()),
  )
  const elRefs = useRef<(HTMLDivElement | null)[]>([])
  const animationFrameRef = useRef<number>(0)
  const lastUpdateRef = useRef<number>(0)
  const isPageVisible = usePageVisibility()

  const setElRef = useCallback(
    (index: number) => (el: HTMLDivElement | null) => {
      elRefs.current[index] = el
    },
    [],
  )

  useEffect(() => {
    if (!isPageVisible) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = 0
      }
      return
    }

    lastUpdateRef.current = 0

    const gameLoop = (timestamp: number) => {
      if (lastUpdateRef.current === 0) {
        lastUpdateRef.current = timestamp
        animationFrameRef.current = requestAnimationFrame(gameLoop)
        return
      }

      const deltaTime = (timestamp - lastUpdateRef.current) / 1000
      lastUpdateRef.current = timestamp

      const width = window.innerWidth
      const height = window.innerHeight
      const positions = positionsRef.current

      for (let i = 0; i < positions.length; i++) {
        const pos = positions[i]
        const fullSize = shapes[i].radius * 2
        let newX = pos.x + pos.dx * deltaTime
        let newY = pos.y + pos.dy * deltaTime

        if (newX > width + fullSize) newX = -fullSize
        else if (newX < -fullSize) newX = width
        if (newY > height + fullSize) newY = -fullSize
        else if (newY < -fullSize) newY = height

        pos.x = newX
        pos.y = newY

        const el = elRefs.current[i]
        if (el) {
          el.style.transform = `translate(${newX}px, ${newY}px)`
        }
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
  }, [isPageVisible, shapes])

  return (
    <div className="fixed inset-0 pointer-events-none z-1">
      {shapes.map((shape, i) => (
        <div
          key={i}
          ref={setElRef(i)}
          className="absolute left-0 top-0"
          style={{
            width: shape.radius * 2,
            height: shape.radius * 2,
            transform: `translate(${positionsRef.current[i].x}px, ${positionsRef.current[i].y}px)`,
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              animation: `spin ${shape.rotationDuration} linear infinite`,
              animationDirection: shape.rotationDirection,
            }}
          >
            <svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${shape.radius * 2} ${shape.radius * 2}`}
            >
              <polygon
                points={shape.points}
                className="stroke-[4px]"
                style={{
                  stroke: 'var(--static-asteroid-border)',
                  fill: 'var(--static-asteroid-fill)',
                }}
              />
            </svg>
          </div>
        </div>
      ))}
    </div>
  )
}

export default FallingAsteroids

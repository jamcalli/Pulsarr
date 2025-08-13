import { useEffect, useRef, useState } from 'react';

interface Asteroid {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  radius: number;
  points: string;
  rotationDuration: string;
  rotationDirection: string;
}

const WIDTH = window.innerWidth;
const HEIGHT = window.innerHeight;
const START_ASTEROID_RADIUS = 125;
const MIN_ASTEROID_RADIUS = 30;
const ASTEROID_VELOCITY = 20; // Slowed down from original 80
const NUM_ASTEROIDS = 8; // Increased number of asteroids

const FallingAsteroids = () => {
  const [asteroids, setAsteroids] = useState<Asteroid[]>([]);
  const animationFrameRef = useRef<number>(0);
  const lastUpdateRef = useRef<number>(Date.now());

  const generateAsteroidPoints = (radius: number): string => {
    const corners = 5 + Math.floor(radius / 8);
    const points: string[] = [];
    
    for (let i = 0; i < corners; i++) {
      const angle = (i * 360) / corners;
      const distance = radius * 0.33 * (2 + Math.random());
      const px = radius + distance * Math.cos((angle * Math.PI) / 180);
      const py = radius + distance * Math.sin((angle * Math.PI) / 180);
      points.push(`${px},${py}`);
    }
    
    return points.join(' ');
  };

  const createAsteroid = (): Asteroid => {
    const radius = MIN_ASTEROID_RADIUS + Math.random() * (START_ASTEROID_RADIUS - MIN_ASTEROID_RADIUS);
    const rotationDuration = `${32}s`;
    const rotationDirection = Math.random() > 0.5 ? 'normal' : 'reverse';
    
    // Random angle and speed (keeping original movement pattern)
    const angle = Math.random() * 360;
    const speed = ASTEROID_VELOCITY * (Math.random() * 0.5 + 0.5) * (Math.random() > 0.5 ? 1 : -1);
    const dx = speed * Math.cos((angle * Math.PI) / 180);
    const dy = speed * Math.sin((angle * Math.PI) / 180);
    // Random starting position
    let x = 0, y = 0;
    const edge = Math.floor(Math.random() * 4);
    
    switch (edge) {
      case 0: // top
        x = Math.random() * WIDTH;
        break;
      case 1: // right
        x = WIDTH;
        y = Math.random() * HEIGHT;
        break;
      case 2: // bottom
        x = Math.random() * WIDTH;
        y = HEIGHT;
        break;
      case 3: // left
        y = Math.random() * HEIGHT;
        break;
    }
    return {
      id: Date.now() + Math.random(),
      x,
      y,
      dx,
      dy,
      radius,
      points: generateAsteroidPoints(radius),
      rotationDuration,
      rotationDirection
    };
  };

  const updateGameState = (deltaTime: number) => {
    setAsteroids(prevAsteroids => {
      return prevAsteroids.map(asteroid => {
        const newX = asteroid.x + asteroid.dx * deltaTime;
        const newY = asteroid.y + asteroid.dy * deltaTime;
        const fullSize = asteroid.radius * 2;
        
        // Wrap around screen edges
        return {
          ...asteroid,
          x: newX > WIDTH + fullSize ? -fullSize : newX < -fullSize ? WIDTH : newX,
          y: newY > HEIGHT + fullSize ? -fullSize : newY < -fullSize ? HEIGHT : newY
        };
      });
    });
  };

  useEffect(() => {
    // Initialize with asteroids
    const initialAsteroids = Array(NUM_ASTEROIDS).fill(null).map(() => createAsteroid());
    setAsteroids(initialAsteroids);
    const gameLoop = (timestamp: number) => {
      const deltaTime = (timestamp - lastUpdateRef.current) / 1000;
      lastUpdateRef.current = timestamp;
      updateGameState(deltaTime);
      animationFrameRef.current = requestAnimationFrame(gameLoop);
    };
    animationFrameRef.current = requestAnimationFrame(gameLoop);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-1">
      {asteroids.map(asteroid => (
        <div
          key={asteroid.id}
          className="absolute"
          style={{
            left: asteroid.x,
            top: asteroid.y,
            width: asteroid.radius * 2,
            height: asteroid.radius * 2,
            animation: `spin ${asteroid.rotationDuration} linear infinite`,
            animationDirection: asteroid.rotationDirection
          }}
        >
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${asteroid.radius * 2} ${asteroid.radius * 2}`}
          >
            <polygon
              points={asteroid.points}
              className="stroke-[4px]"
              style={{
                stroke: 'var(--static-asteroid-border)',
                fill: 'var(--static-asteroid-fill)'
              }}
            />
          </svg>
        </div>
      ))}
    </div>
  );
};

export default FallingAsteroids;
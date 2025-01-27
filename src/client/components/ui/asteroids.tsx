import { useEffect, useState, useRef } from 'react';

interface Asteroid {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  radius: number;
  points: string;
  damage: number;
  rotationDuration: string;
  rotationDirection: string;
}

interface Bullet {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  damage: number;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  size: number;
  opacity: number;
  damping: number;
  lifetime: number;
}

const WIDTH = window.innerWidth;
const HEIGHT = window.innerHeight;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;
const START_ASTEROID_RADIUS = 125;
const MIN_ASTEROID_RADIUS = 30;
const ASTEROID_START_VELOCITY = 80;
const BULLET_SPEED = 400;
const BULLET_DAMAGE = 10;
const BULLET_SIZE = 6;
const DUST_SIZE = 5;
const EXPLOSION_PARTICLES = 60;
const IMPACT_PARTICLES = 10;

const PARTICLE_SPEED_MIN = 100;
const PARTICLE_SPEED_MAX = 300;
const ASTEROID_HEALTH_MULTIPLIER = 3.0; // Increased from 1.5 to make asteroids tougher
const MAX_PARTICLES = 300;
const PARTICLE_LIFETIME = 1.0; // Seconds before particle starts fading

const AsteroidsBackground = () => {
  const [asteroids, setAsteroids] = useState<Asteroid[]>([]);
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const animationFrameRef = useRef<number>(0);
  const lastUpdateRef = useRef<number>(Date.now());
  const mousePositionRef = useRef({ x: CENTER_X, y: CENTER_Y });

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

  const createAsteroid = (radius = START_ASTEROID_RADIUS): Asteroid => {
    const rotationDuration = `${32}s`;
    const rotationDirection = Math.random() > 0.5 ? 'normal' : 'reverse';
    
    const angle = Math.random() * 360;
    const speed = ASTEROID_START_VELOCITY * (Math.random() * 0.5 + 0.5) * (Math.random() > 0.5 ? 1 : -1);
    const dx = speed * Math.cos((angle * Math.PI) / 180);
    const dy = speed * Math.sin((angle * Math.PI) / 180);

    let x = 0, y = 0;
    const edge = Math.floor(Math.random() * 4);
    
    switch (edge) {
      case 0:
        x = Math.random() * WIDTH;
        break;
      case 1:
        x = WIDTH;
        y = Math.random() * HEIGHT;
        break;
      case 2:
        x = Math.random() * WIDTH;
        y = HEIGHT;
        break;
      case 3:
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
      damage: 0,
      rotationDuration,
      rotationDirection
    };
  };

  const createParticles = (
    x: number,
    y: number,
    dx: number,
    dy: number,
    count: number,
    isExplosion: boolean = false,
    asteroidRadius?: number
  ): Particle[] => {
    const particles: Particle[] = [];
    const actualCount = isExplosion && asteroidRadius 
      ? Math.floor(count * MIN_ASTEROID_RADIUS / asteroidRadius)
      : count;
    
    for (let i = 0; i < actualCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * (PARTICLE_SPEED_MAX - PARTICLE_SPEED_MIN) + PARTICLE_SPEED_MIN;
      const size = DUST_SIZE * (Math.random() * 0.5 + 0.75);
      
      particles.push({
        id: Date.now() + Math.random(),
        x,
        y,
        dx: Math.cos(angle) * speed + dx * 0.25,
        dy: Math.sin(angle) * speed + dy * 0.25,
        size,
        opacity: Math.random() * 0.3 + 0.2, // Range of 0.2-0.5
        damping: Math.random() * 0.19 + 0.8, // Range of 0.8-0.99
        lifetime: PARTICLE_LIFETIME
      });
    }
    
    return particles;
  };

  const checkCollision = (bullet: Bullet, asteroid: Asteroid): { collided: boolean; impactPoint: { x: number, y: number } } => {
    const bulletCenterX = bullet.x + BULLET_SIZE / 2;
    const bulletCenterY = bullet.y + BULLET_SIZE / 2;
    const asteroidCenterX = asteroid.x + asteroid.radius;
    const asteroidCenterY = asteroid.y + asteroid.radius;

    const dx = bulletCenterX - asteroidCenterX;
    const dy = bulletCenterY - asteroidCenterY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    const collided = distance < asteroid.radius * 0.75;
    
    let impactPoint = { x: bulletCenterX, y: bulletCenterY };
    if (collided) {
      const angle = Math.atan2(dy, dx);
      impactPoint = {
        x: asteroidCenterX + Math.cos(angle) * asteroid.radius * 0.75,
        y: asteroidCenterY + Math.sin(angle) * asteroid.radius * 0.75
      };
    }

    return { collided, impactPoint };
  };

  const handleMouseMove = (e: MouseEvent) => {
    mousePositionRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleClick = () => {
    const angle = Math.atan2(
      mousePositionRef.current.y - CENTER_Y,
      mousePositionRef.current.x - CENTER_X
    );
    
    const newBullet: Bullet = {
      id: Date.now() + Math.random(),
      x: CENTER_X,
      y: CENTER_Y,
      dx: Math.cos(angle) * BULLET_SPEED,
      dy: Math.sin(angle) * BULLET_SPEED,
      damage: BULLET_DAMAGE
    };
    
    setBullets(prev => [...prev, newBullet]);
  };

  const updateGameState = (deltaTime: number) => {
    // Update bullets and check collisions
    setBullets(prevBullets => {
      const activeBullets = [...prevBullets];
      const bulletHits: number[] = [];

      setAsteroids(prevAsteroids => {
        let updatedAsteroids: Asteroid[] = [];
        prevAsteroids.forEach(asteroid => {
          // Check all bullets against this asteroid
          for (let i = activeBullets.length - 1; i >= 0; i--) {
            const bullet = activeBullets[i];
            const { collided, impactPoint } = checkCollision(bullet, asteroid);
            
            if (collided) {
              bulletHits.push(bullet.id);
              activeBullets.splice(i, 1);

              // Create impact particles
              setParticles(prev => [
                ...prev,
                ...createParticles(
                  impactPoint.x,
                  impactPoint.y,
                  asteroid.dx,
                  asteroid.dy,
                  IMPACT_PARTICLES,
                  false
                )
              ]);

              asteroid = {
                ...asteroid,
                damage: asteroid.damage + BULLET_DAMAGE
              };

              if (asteroid.damage >= asteroid.radius * ASTEROID_HEALTH_MULTIPLIER) {
                setScore(s => s + Math.ceil(2 * START_ASTEROID_RADIUS / asteroid.radius));
                
                // Create explosion particles
                setParticles(prev => {
                  const newParticles = createParticles(
                    asteroid.x + asteroid.radius,
                    asteroid.y + asteroid.radius,
                    asteroid.dx,
                    asteroid.dy,
                    EXPLOSION_PARTICLES,
                    true,
                    asteroid.radius
                  );
                  return [...prev, ...newParticles].slice(-MAX_PARTICLES);
                });

                // Split asteroid if large enough
                if (asteroid.radius > MIN_ASTEROID_RADIUS) {
                  const newAsteroids = [];
                  for (let i = 0; i < 2; i++) {
                    const newRadius = asteroid.radius * 0.6;
                    const splitAsteroid = createAsteroid(newRadius);
                    // Position at parent asteroid's location
                    splitAsteroid.x = asteroid.x + (Math.random() - 0.5) * asteroid.radius;
                    splitAsteroid.y = asteroid.y + (Math.random() - 0.5) * asteroid.radius;
                    // Inherit some of parent's velocity plus random spread
                    const spreadSpeed = ASTEROID_START_VELOCITY * 0.5;
                    const spreadAngle = Math.random() * Math.PI * 2;
                    splitAsteroid.dx = asteroid.dx * 1.2 + Math.cos(spreadAngle) * spreadSpeed;
                    splitAsteroid.dy = asteroid.dy * 1.2 + Math.sin(spreadAngle) * spreadSpeed;
                    newAsteroids.push(splitAsteroid);
                  }
                  return newAsteroids;
                }
                // If too small, remove the asteroid
                return null;
              }
            }
          }

          // Update asteroid position
          const newX = asteroid.x + asteroid.dx * deltaTime;
          const newY = asteroid.y + asteroid.dy * deltaTime;
          const fullSize = asteroid.radius * 2;
          
          const updatedAsteroid = {
            ...asteroid,
            x: newX > WIDTH + fullSize ? -fullSize : newX < -fullSize ? WIDTH : newX,
            y: newY > HEIGHT + fullSize ? -fullSize : newY < -fullSize ? HEIGHT : newY
          };
          updatedAsteroids.push(updatedAsteroid);
        });

        // Handle asteroid splitting and level progression
        if (updatedAsteroids.length === 0) {
          setLevel(l => {
            const newLevel = l + 1;
            return newLevel;
          });
          // Create new asteroids for the next level
          const nextLevelAsteroids = Array(level + 2).fill(null).map(() => createAsteroid());
          return nextLevelAsteroids;
        }

        return updatedAsteroids;
      });

      // Update remaining bullet positions and remove off-screen bullets
      return activeBullets
        .filter(bullet => {
          const newX = bullet.x + bullet.dx * deltaTime;
          const newY = bullet.y + bullet.dy * deltaTime;
          return !(newX < 0 || newX > WIDTH || newY < 0 || newY > HEIGHT);
        })
        .map(bullet => ({
          ...bullet,
          x: bullet.x + bullet.dx * deltaTime,
          y: bullet.y + bullet.dy * deltaTime
        }));
    });

    // Update particles
    setParticles(prev => prev
      .map(particle => {
        const newLifetime = particle.lifetime - deltaTime;
        // Use the particle's individual damping value
        return {
          ...particle,
          x: particle.x + particle.dx * deltaTime,
          y: particle.y + particle.dy * deltaTime,
          dx: particle.dx * particle.damping,
          dy: particle.dy * particle.damping,
          lifetime: newLifetime,
          opacity: newLifetime > 0 ? particle.opacity : particle.opacity * particle.damping
        };
      })
      .filter(particle => particle.opacity > 0.1)
      .slice(-MAX_PARTICLES)
    );
  }; // Close updateGameState

  useEffect(() => {
    // Initialize with level 1 asteroids
    const initialAsteroids = Array(2).fill(null).map(() => createAsteroid());
    setAsteroids(initialAsteroids);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', handleClick);

    const gameLoop = (timestamp: number) => {
      const deltaTime = (timestamp - lastUpdateRef.current) / 1000;
      lastUpdateRef.current = timestamp;
      updateGameState(deltaTime);
      animationFrameRef.current = requestAnimationFrame(gameLoop);
    };

    animationFrameRef.current = requestAnimationFrame(gameLoop);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleClick);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none">
      <div className="absolute left-12 top-6 text-blue-200 font-mono text-4xl z-50">
        {score.toString().padStart(5, '0')}
      </div>
      
      {/* Asteroids */}
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
            animationDirection: asteroid.rotationDirection,
            zIndex: 20
          }}
        >
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${asteroid.radius * 2} ${asteroid.radius * 2}`}
            className="transition-colors duration-300"
          >
            <polygon
              points={asteroid.points}
              className="fill-[rgb(20,20,20)] stroke-[rgb(160,160,160)] stroke-[4px]"
              style={{
                fill: `rgb(${20 + (asteroid.damage / (asteroid.radius * ASTEROID_HEALTH_MULTIPLIER)) * 140},${
                  20 + (asteroid.damage / (asteroid.radius * ASTEROID_HEALTH_MULTIPLIER)) * 140
                },${20 + (asteroid.damage / (asteroid.radius * ASTEROID_HEALTH_MULTIPLIER)) * 140})`
              }}
            />
          </svg>
        </div>
      ))}

      {/* Bullets */}
      {bullets.map(bullet => (
        <div
          key={bullet.id}
          className="absolute w-1.5 h-1.5 bg-white rounded-full opacity-95"
          style={{
            left: bullet.x,
            top: bullet.y,
            width: BULLET_SIZE,
            height: BULLET_SIZE,
            zIndex: 30
          }}
        />
      ))}

      {/* Particles */}
      {particles.map(particle => (
        <div
          key={particle.id}
          className="absolute rounded-full bg-white"
          style={{
            left: particle.x,
            top: particle.y,
            width: particle.size,
            height: particle.size,
            opacity: particle.opacity,
            zIndex: 40
          }}
        />
      ))}
    </div>
  );
};

export default AsteroidsBackground;
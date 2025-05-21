import type React from 'react';
import { useEffect, useState, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  size: number;
  parallax: boolean;
  opacity: number;
  pulseDelay: number;
}

interface MousePosition {
  x: number;
  y: number;
}

const ParallaxStarfield = ({ children }: { children: React.ReactNode }) => {
  const [stars, setStars] = useState<Star[]>([]);
  const [mousePos, setMousePos] = useState<MousePosition>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const starCount = 140;
    const newStars = Array.from({ length: starCount }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2.5 + 1,
      parallax: Math.random() < 0.15,
      opacity: Math.random() * 0.5 + 0.2,
      pulseDelay: Math.random() * 8
    }));
    setStars(newStars);

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setMousePos({
        x: ((e.clientX - rect.left) / rect.width - 0.5) * 0.5,
        y: ((e.clientY - rect.top) / rect.height - 0.5) * 0.5
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 overflow-hidden bg-secondaryBlack pointer-events-none"
    >
      {stars.map((star, i) => (
        <div
          key={i}
          className={`absolute rounded-full transition-transform duration-700 ease-out bg-white ${
            star.parallax ? 'animate-starPulse' : ''
          }`}
          style={{
            left: `${star.x + (star.parallax ? mousePos.x : 0)}%`,
            top: `${star.y + (star.parallax ? mousePos.y : 0)}%`,
            width: star.size,
            height: star.size,
            opacity: star.opacity,
            transform: `scale(${star.parallax ? 1.2 : 1})`,
            animationDelay: star.parallax ? `${star.pulseDelay}s` : undefined
          }}
        />
      ))}
      <div className="relative z-10 pointer-events-auto">
        {children}
      </div>
    </div>
  );
};

export default ParallaxStarfield;
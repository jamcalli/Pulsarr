import { useId } from 'react'

const Pulsar = ({ className = "w-96 h-96" }) => {
  const starGlowId = useId()
  const beamGradientId = useId()
  const conicalGlowId = useId()
  const blurId = useId()

  return (
    <div className={className}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" className="w-full h-full">
        <defs>
          <radialGradient id={starGlowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8"/>
            <stop offset="40%" stopColor="#a0c3ff" stopOpacity="0.4"/>
            <stop offset="100%" stopColor="#0b1b3d" stopOpacity="0"/>
          </radialGradient>
          
          <linearGradient id={beamGradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="white" stopOpacity="0"/>
            <stop offset="45%" stopColor="white" stopOpacity="0.8"/>
            <stop offset="55%" stopColor="white" stopOpacity="0.8"/>
            <stop offset="100%" stopColor="white" stopOpacity="0"/>
          </linearGradient>

          <radialGradient id={conicalGlowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="white" stopOpacity="0.4"/>
            <stop offset="100%" stopColor="white" stopOpacity="0"/>
          </radialGradient>
          
          <filter id={blurId}>
            <feGaussianBlur stdDeviation="2"/>
          </filter>
        </defs>

        {/* Main glow effect */}
        <circle cx="200" cy="200" r="80" fill={`url(#${starGlowId})`} filter={`url(#${blurId})`}>
          <animate 
            attributeName="opacity"
            values="0.8;1;0.8"
            dur="2s"
            repeatCount="indefinite"/>
        </circle>

        {/* Central star */}
        <circle cx="200" cy="200" r="20" fill="white">
          <animate
            attributeName="r"
            values="20;22;20"
            dur="2s"
            repeatCount="indefinite"/>
        </circle>

        {/* Rotating beams with conical gradient */}
        <g>
          <animateTransform
            attributeName="transform"
            attributeType="XML"
            type="rotate"
            from="0 200 200"
            to="360 200 200"
            dur="4s"
            repeatCount="indefinite"/>
          
          {/* Central beam columns */}
          <rect x="198" y="0" width="4" height="400" fill={`url(#${beamGradientId})`} filter={`url(#${blurId})`}/>
          
          {/* Conical gradient overlays */}
          <path d="M 198,200 L 202,200 L 240,0 L 160,0 Z" fill={`url(#${conicalGlowId})`} filter={`url(#${blurId})`}/>
          <path d="M 198,200 L 202,200 L 240,400 L 160,400 Z" fill={`url(#${conicalGlowId})`} filter={`url(#${blurId})`}/>
        </g>
      </svg>
    </div>
  );
};

export default Pulsar;
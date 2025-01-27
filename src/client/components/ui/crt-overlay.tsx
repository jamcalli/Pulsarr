import React from 'react';

interface CRTOverlayProps {
  children: React.ReactNode;
  className?: string;
  intensity?: 'light' | 'medium' | 'heavy';
}

const CRTOverlay = ({ 
  children, 
  className = '',
  intensity = 'medium' 
}: CRTOverlayProps) => {
  // Intensity settings for different effect levels
  const intensitySettings = {
    light: {
      scanlineOpacity: 0.1,
      rgbOffset: 0.03,
      flickerOpacity: 0.05
    },
    medium: {
      scanlineOpacity: 0.25,
      rgbOffset: 0.06,
      flickerOpacity: 0.1
    },
    heavy: {
      scanlineOpacity: 0.4,
      rgbOffset: 0.09,
      flickerOpacity: 0.15
    }
  };

  const settings = intensitySettings[intensity];

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Original content */}
      {children}

      {/* CRT Effects Overlay */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Scanlines and RGB split */}
        <div 
          className="absolute inset-0 animate-hardFlicker"
          style={{
            background: `
              linear-gradient(
                transparent 50%, 
                rgba(0, 0, 0, ${settings.scanlineOpacity}) 50%
              ),
              linear-gradient(
                90deg, 
                rgba(255, 0, 0, ${settings.rgbOffset}), 
                rgba(0, 255, 0, ${settings.rgbOffset * 0.33}), 
                rgba(0, 0, 255, ${settings.rgbOffset})
              )
            `,
            backgroundSize: '100% 2px, 3px 100%',
            zIndex: 20
          }}
        />
        
        {/* Flicker overlay */}
        <div 
          className="absolute inset-0 animate-softFlicker bg-black"
          style={{ 
            opacity: settings.flickerOpacity,
            zIndex: 20 
          }}
        />
      </div>
    </div>
  );
};

export default CRTOverlay;
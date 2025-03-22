import React from 'react'

declare const __APP_VERSION__: string

interface VersionDisplayProps {
  className?: string;
  style?: React.CSSProperties;
}

export function VersionDisplay({ className = '', style }: VersionDisplayProps) {
  return (
    <div className={className} style={style}>
      v{__APP_VERSION__}
    </div>
  )
}
import React from 'react'
import BrowserOnly from '@docusaurus/BrowserOnly'

interface SSRSafeStarfieldProps {
  children: React.ReactNode
}

export default function SSRSafeStarfield({ children }: SSRSafeStarfieldProps) {
  return (
    <BrowserOnly
      fallback={<div className="fixed inset-0 bg-black">{children}</div>}
    >
      {() => {
        const Starfield = require('@/client/components/ui/starfield').default
        return <Starfield>{children}</Starfield>
      }}
    </BrowserOnly>
  )
}

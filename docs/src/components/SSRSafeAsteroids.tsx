import React from 'react'
import BrowserOnly from '@docusaurus/BrowserOnly'

export default function SSRSafeAsteroids() {
  return (
    <BrowserOnly>
      {() => {
        const Asteroids = require('@/client/components/ui/asteroids').default
        return <Asteroids />
      }}
    </BrowserOnly>
  )
}

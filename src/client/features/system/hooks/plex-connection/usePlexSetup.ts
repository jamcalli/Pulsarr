import { useState } from 'react'

export function usePlexSetup() {
  const [showSetupModal, setShowSetupModal] = useState(false)

  return {
    showSetupModal,
    setShowSetupModal,
  }
}

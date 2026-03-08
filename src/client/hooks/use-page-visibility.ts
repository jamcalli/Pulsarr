import { useEffect, useState } from 'react'

export function usePageVisibility(): boolean {
  const [visible, setVisible] = useState(!document.hidden)

  useEffect(() => {
    function onChange() {
      setVisible(!document.hidden)
    }

    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  return visible
}

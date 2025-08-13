import type { ProgressEvent } from '@root/types/progress.types'
import { useCallback, useEffect, useState } from 'react'
import { useProgressStore } from '@/stores/progressStore'

export function useDiscordStatus() {
  const [status, setStatus] = useState<string>('unknown')
  const subscribeToType = useProgressStore(state => state.subscribeToType)

  const handleEvent = useCallback((event: ProgressEvent) => {
    if (event.type === 'system' && event.message?.startsWith('Discord bot status:')) {
      const botStatus = event.message.replace('Discord bot status:', '').trim()
      setStatus(botStatus)
    }
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeToType('system', handleEvent)
    return () => {
      unsubscribe()
    }
  }, [subscribeToType, handleEvent])

  return status
}
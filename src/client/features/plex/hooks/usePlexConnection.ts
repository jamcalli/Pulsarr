import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { useConfigStore } from '@/stores/configStore'
import { MIN_LOADING_DELAY } from '@/features/plex/store/constants'
import { plexTokenSchema } from '@/features/plex/store/schemas'
import type { PlexTokenSchema } from '@/features/plex/store/schemas'
import type { Config } from '@root/schemas/config/config.schema'

export type ConnectionStatus = 'idle' | 'loading' | 'success' | 'error'

export function usePlexConnection() {
  const config = useConfigStore((state) => state.config)
  const updateConfig = useConfigStore((state) => state.updateConfig)
  const [isInitialized, setIsInitialized] = useState(false)
  const [status, setStatus] = useState<ConnectionStatus>('idle')
  const [isLoading, setIsLoading] = useState(true)

  const form = useForm<PlexTokenSchema>({
    resolver: zodResolver(plexTokenSchema),
    defaultValues: {
      plexToken: '',
    },
  })

  useEffect(() => {
    if (config) {
      const token = config.plexTokens?.[0] || ''
      form.setValue('plexToken', token)
      setIsInitialized(true)

      const timer = setTimeout(() => {
        setIsLoading(false)
      }, MIN_LOADING_DELAY)

      return () => clearTimeout(timer)
    }
  }, [config, form])

  const handleUpdateToken = async (data: PlexTokenSchema) => {
    setStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, MIN_LOADING_DELAY),
      )

      const configUpdate: Partial<Config> = {
        plexTokens: [data.plexToken],
      }

      await Promise.all([updateConfig(configUpdate), minimumLoadingTime])

      setStatus('success')
      toast.success('Plex token has been updated successfully')
    } catch (error) {
      console.error('Token update error:', error)
      setStatus('error')
      toast.error('Failed to update token')
    } finally {
      setStatus('idle')
    }
  }

  const handleRemoveToken = async () => {
    setStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, MIN_LOADING_DELAY),
      )

      // Create a config update with empty plexTokens array
      const configUpdate: Partial<Config> = {
        plexTokens: [],
      }

      await Promise.all([updateConfig(configUpdate), minimumLoadingTime])

      form.reset({ plexToken: '' })
      setStatus('idle')
      toast.success('Plex token has been removed')
    } catch (error) {
      setStatus('error')
      toast.error('Failed to remove token')
    } finally {
      setStatus('idle')
    }
  }

  return {
    form,
    isInitialized,
    isLoading,
    status,
    setStatus,
    handleUpdateToken,
    handleRemoveToken,
  }
}

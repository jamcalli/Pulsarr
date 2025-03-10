import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useToast } from '@/hooks/use-toast'
import { useConfigStore } from '@/stores/configStore'
import { MIN_LOADING_DELAY } from '@/features/plex/store/constants'

export type ConnectionStatus = 'idle' | 'loading' | 'success' | 'error'

const plexTokenFormSchema = z.object({
  plexToken: z.string().min(5, { message: 'Plex Token is required' }),
})

export type PlexTokenFormSchema = z.infer<typeof plexTokenFormSchema>

export function usePlexConnection() {
  const { toast } = useToast()
  const config = useConfigStore((state) => state.config)
  const updateConfig = useConfigStore((state) => state.updateConfig)
  const [isInitialized, setIsInitialized] = useState(false)
  const [status, setStatus] = useState<ConnectionStatus>('idle')
  const [isLoading, setIsLoading] = useState(true)

  const form = useForm<PlexTokenFormSchema>({
    resolver: zodResolver(plexTokenFormSchema),
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
        setIsLoading(false);
      }, MIN_LOADING_DELAY);
      
      return () => clearTimeout(timer);
    }
  }, [config, form])

  const handleUpdateToken = async (data: PlexTokenFormSchema) => {
    setStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, MIN_LOADING_DELAY),
      )

      await Promise.all([
        updateConfig({
          plexTokens: [data.plexToken],
        }),
        minimumLoadingTime,
      ])

      setStatus('success')
      toast({
        title: 'Token Updated',
        description: 'Plex token has been updated successfully',
        variant: 'default',
      })
    } catch (error) {
      console.error('Token update error:', error)
      setStatus('error')
      toast({
        title: 'Error',
        description: 'Failed to update token',
        variant: 'destructive',
      })
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

      await Promise.all([
        updateConfig({
          plexTokens: [],
        }),
        minimumLoadingTime,
      ])

      form.reset({ plexToken: '' })
      setStatus('idle')
      toast({
        title: 'Token Removed',
        description: 'Plex token has been removed',
        variant: 'default',
      })
    } catch (error) {
      setStatus('error')
      toast({
        title: 'Error',
        description: 'Failed to remove token',
        variant: 'destructive',
      })
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
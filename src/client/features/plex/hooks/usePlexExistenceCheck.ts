import { zodResolver } from '@hookform/resolvers/zod'
import {
  type Config,
  ConfigUpdateSchema,
} from '@root/schemas/config/config.schema'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'
import { MIN_LOADING_DELAY } from '@/features/plex/store/constants'
import { useConfigStore } from '@/stores/configStore'

// Pick Plex existence check fields from the backend ConfigUpdateSchema
const plexExistenceCheckFormSchema = ConfigUpdateSchema.pick({
  skipIfExistsOnPlex: true,
  plexServerUrl: true,
})

type PlexExistenceCheckFormValues = z.infer<typeof plexExistenceCheckFormSchema>

/**
 * React hook for managing Plex existence check configuration.
 *
 * Manages the skipIfExistsOnPlex setting via a form, tracking dirty state,
 * and providing save/cancel handlers following the established pattern.
 */
export function usePlexExistenceCheck() {
  const config = useConfigStore((state) => state.config)
  const updateConfig = useConfigStore((state) => state.updateConfig)
  const [isSaving, setIsSaving] = useState(false)

  const form = useForm<PlexExistenceCheckFormValues>({
    resolver: zodResolver(plexExistenceCheckFormSchema),
    defaultValues: {
      skipIfExistsOnPlex: false,
      plexServerUrl: '',
    },
  })

  // Initialize form with config values
  useEffect(() => {
    if (config) {
      form.reset({
        skipIfExistsOnPlex: config.skipIfExistsOnPlex ?? false,
        plexServerUrl: config.plexServerUrl ?? '',
      })
    }
  }, [config, form])

  const onSubmit = async (data: PlexExistenceCheckFormValues) => {
    setIsSaving(true)
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, MIN_LOADING_DELAY),
      )

      const configUpdate: Partial<Config> = {
        skipIfExistsOnPlex: data.skipIfExistsOnPlex,
        plexServerUrl: data.plexServerUrl || '',
      }

      await Promise.all([updateConfig(configUpdate), minimumLoadingTime])

      toast.success('Plex settings updated successfully')
      form.reset(data) // Mark form as pristine
    } catch (error) {
      console.error('Failed to update Plex settings:', error)
      toast.error('Failed to update settings')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    // Reset form to last saved values from config store
    if (config) {
      form.reset({
        skipIfExistsOnPlex: config.skipIfExistsOnPlex ?? false,
        plexServerUrl: config.plexServerUrl ?? '',
      })
    }
  }

  return {
    form,
    isSaving,
    onSubmit,
    handleCancel,
  }
}

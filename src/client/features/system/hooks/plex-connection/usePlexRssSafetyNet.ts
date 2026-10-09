import { zodResolver } from '@hookform/resolvers/zod'
import {
  ConfigUpdateSchema,
  RSS_SAFETY_NET_DEFAULT_MINUTES,
} from '@root/schemas/config/config.schema'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'
import { updateConfig, useConfig } from '@/hooks/useConfig'
import { MIN_LOADING_DELAY } from '@/lib/plex-constants'
import type { components } from '@/types/api.js'

// Pick RSS safety net fields from the backend ConfigUpdateSchema
const plexRssSafetyNetFormSchema = ConfigUpdateSchema.pick({
  rssSafetyNetEnabled: true,
  rssSafetyNetIntervalMinutes: true,
})

type PlexRssSafetyNetFormValues = z.infer<typeof plexRssSafetyNetFormSchema>

/**
 * React hook for managing the RSS safety net configuration.
 *
 * The safety net only runs in RSS mode (Plex Pass): it checks one user at a time
 * for adds the RSS feed missed, each user once per interval.
 */
export function usePlexRssSafetyNet() {
  const { config } = useConfig()
  const [isSaving, setIsSaving] = useState(false)

  const form = useForm<PlexRssSafetyNetFormValues>({
    resolver: zodResolver(plexRssSafetyNetFormSchema),
    defaultValues: {
      rssSafetyNetEnabled: false,
      rssSafetyNetIntervalMinutes: RSS_SAFETY_NET_DEFAULT_MINUTES,
    },
  })

  // Initialize form with config values
  useEffect(() => {
    if (config) {
      form.reset({
        rssSafetyNetEnabled: config.rssSafetyNetEnabled ?? false,
        rssSafetyNetIntervalMinutes:
          config.rssSafetyNetIntervalMinutes ?? RSS_SAFETY_NET_DEFAULT_MINUTES,
      })
    }
  }, [config, form])

  const onSubmit = async (data: PlexRssSafetyNetFormValues) => {
    setIsSaving(true)
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, MIN_LOADING_DELAY),
      )

      const configUpdate: Partial<
        components['schemas']['ConfigUpdatePayload']
      > = {
        rssSafetyNetEnabled: data.rssSafetyNetEnabled,
        rssSafetyNetIntervalMinutes: data.rssSafetyNetIntervalMinutes,
      }

      await Promise.all([updateConfig(configUpdate), minimumLoadingTime])

      toast.success('RSS safety net settings updated successfully')
      form.reset(data) // Mark form as pristine
    } catch (error) {
      console.error('Failed to update RSS safety net settings:', error)
      toast.error('Failed to update settings')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    // Reset form to last saved config values
    if (config) {
      form.reset({
        rssSafetyNetEnabled: config.rssSafetyNetEnabled ?? false,
        rssSafetyNetIntervalMinutes:
          config.rssSafetyNetIntervalMinutes ?? RSS_SAFETY_NET_DEFAULT_MINUTES,
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

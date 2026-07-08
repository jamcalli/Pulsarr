import { zodResolver } from '@hookform/resolvers/zod'
import {
  type Config,
  ConfigUpdateSchema,
} from '@root/schemas/config/config.schema'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'
import { MIN_LOADING_DELAY } from '@/lib/constants'
import { useConfigStore } from '@/stores/configStore'

// Pick the default-routing behavior field from the backend ConfigUpdateSchema
const defaultRoutingBehaviorFormSchema = ConfigUpdateSchema.pick({
  skipDefaultRoutingWhenNoMatch: true,
})

type DefaultRoutingBehaviorFormValues = z.infer<
  typeof defaultRoutingBehaviorFormSchema
>

/**
 * React hook for managing the "skip default routing when no rule matches"
 * global setting.
 *
 * Manages the skipDefaultRoutingWhenNoMatch setting via a form, tracking dirty
 * state, and providing save/cancel handlers following the established config
 * form pattern (see usePlexExistenceCheck).
 */
export function useDefaultRoutingBehavior() {
  const config = useConfigStore((state) => state.config)
  const updateConfig = useConfigStore((state) => state.updateConfig)
  const [isSaving, setIsSaving] = useState(false)

  const form = useForm<DefaultRoutingBehaviorFormValues>({
    resolver: zodResolver(defaultRoutingBehaviorFormSchema),
    defaultValues: {
      skipDefaultRoutingWhenNoMatch: false,
    },
  })

  // Initialize form with config values
  useEffect(() => {
    if (config) {
      form.reset({
        skipDefaultRoutingWhenNoMatch:
          config.skipDefaultRoutingWhenNoMatch ?? false,
      })
    }
  }, [config, form])

  const onSubmit = async (data: DefaultRoutingBehaviorFormValues) => {
    setIsSaving(true)
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, MIN_LOADING_DELAY),
      )

      const configUpdate: Partial<Config> = {
        skipDefaultRoutingWhenNoMatch: data.skipDefaultRoutingWhenNoMatch,
      }

      await Promise.all([updateConfig(configUpdate), minimumLoadingTime])

      toast.success('Default routing behavior updated successfully')
      form.reset(data) // Mark form as pristine
    } catch (error) {
      console.error('Failed to update default routing behavior:', error)
      toast.error('Failed to update settings')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    // Reset form to last saved values from config store
    if (config) {
      form.reset({
        skipDefaultRoutingWhenNoMatch:
          config.skipDefaultRoutingWhenNoMatch ?? false,
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

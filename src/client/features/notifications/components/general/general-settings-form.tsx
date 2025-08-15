// src/client/features/notifications/components/general/general-settings-form.tsx

import { zodResolver } from '@hookform/resolvers/zod'
import { InfoIcon, Loader2, Save, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useConfigStore } from '@/stores/configStore'

// Frontend form schema with user-friendly validation (before conversion to milliseconds)
const generalFormSchema = z.object({
  queueWaitTime: z.coerce
    .number()
    .int()
    .min(0, { error: 'Queue wait time must be at least 0 minutes' })
    .max(5, { error: 'Queue wait time cannot exceed 5 minutes' })
    .optional(),
  newEpisodeThreshold: z.coerce
    .number()
    .int()
    .min(0, { error: 'New episode threshold must be at least 0 hours' })
    .max(720, {
      error: 'New episode threshold cannot exceed 720 hours (1 month)',
    })
    .optional(),
  upgradeBufferTime: z.coerce
    .number()
    .int()
    .min(0, { error: 'Upgrade buffer time must be at least 0 seconds' })
    .max(10, { error: 'Upgrade buffer time cannot exceed 10 seconds' })
    .optional(),
})

interface GeneralSettingsFormProps {
  isInitialized: boolean
}

// Default values in milliseconds
const DEFAULT_QUEUE_WAIT_TIME = 120000 // 2 minutes
const DEFAULT_NEW_EPISODE_THRESHOLD = 172800000 // 48 hours (2 days)
const DEFAULT_UPGRADE_BUFFER_TIME = 2000 // 2 seconds

/**
 * Render a form for editing general notification settings.
 *
 * Displays and edits queue wait time (minutes), new episode threshold (hours),
 * and upgrade buffer time (seconds). Values are presented in user-friendly units,
 * validated against the schema, converted back to milliseconds for storage, and
 * persisted to the central config store on submit. Provides loading, success,
 * and error states plus form reset/cancel behavior.
 *
 * @param isInitialized - True when initial configuration has been loaded and the form may be submitted.
 * @returns The React element for the general settings form.
 */
export function GeneralSettingsForm({
  isInitialized,
}: GeneralSettingsFormProps) {
  const config = useConfigStore((state) => state.config)
  const updateConfig = useConfigStore((state) => state.updateConfig)
  const [generalStatus, setGeneralStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')

  const generalForm = useForm<z.input<typeof generalFormSchema>>({
    resolver: zodResolver(generalFormSchema),
    mode: 'onBlur',
    defaultValues: {},
  })

  // Helper functions to convert between storage and display units
  const getDisplayValues = useCallback((configData: typeof config) => {
    if (!configData) return null

    return {
      queueWaitTime: Math.round(
        (configData.queueWaitTime ?? DEFAULT_QUEUE_WAIT_TIME) / (60 * 1000),
      ),
      newEpisodeThreshold: Math.round(
        (configData.newEpisodeThreshold ?? DEFAULT_NEW_EPISODE_THRESHOLD) /
          (60 * 60 * 1000),
      ),
      upgradeBufferTime: Math.round(
        (configData.upgradeBufferTime ?? DEFAULT_UPGRADE_BUFFER_TIME) / 1000,
      ),
    }
  }, [])

  // Convert milliseconds to appropriate display units
  useEffect(() => {
    const displayValues = getDisplayValues(config)
    if (displayValues) {
      generalForm.reset(displayValues)
    }
  }, [config, generalForm, getDisplayValues])

  const resetForm = () => {
    const displayValues = getDisplayValues(config)
    if (displayValues) {
      generalForm.reset(displayValues)
    }
  }

  const onSubmitGeneral = async (data: z.input<typeof generalFormSchema>) => {
    // Transform the form data to ensure proper types
    const transformedData: z.output<typeof generalFormSchema> =
      generalFormSchema.parse(data)
    setGeneralStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

      // Convert back to milliseconds for storage
      const updatedConfig = {
        queueWaitTime:
          transformedData.queueWaitTime !== undefined
            ? transformedData.queueWaitTime * 60 * 1000
            : DEFAULT_QUEUE_WAIT_TIME,
        newEpisodeThreshold:
          transformedData.newEpisodeThreshold !== undefined
            ? transformedData.newEpisodeThreshold * 60 * 60 * 1000
            : DEFAULT_NEW_EPISODE_THRESHOLD,
        upgradeBufferTime:
          transformedData.upgradeBufferTime !== undefined
            ? transformedData.upgradeBufferTime * 1000
            : DEFAULT_UPGRADE_BUFFER_TIME,
      }

      await Promise.all([updateConfig(updatedConfig), minimumLoadingTime])

      setGeneralStatus('success')

      // Keep the display values in the form
      generalForm.reset(transformedData)

      toast.success('General notification settings have been updated')

      setTimeout(() => {
        setGeneralStatus('idle')
      }, 1000)
    } catch (error) {
      console.error('General settings update error:', error)
      setGeneralStatus('error')
      toast.error('Failed to update general settings')

      await new Promise((resolve) => setTimeout(resolve, 1000))
      setGeneralStatus('idle')
    }
  }

  const isDirty = generalForm.formState.isDirty

  return (
    <div className="relative">
      <Form {...generalForm}>
        <form
          onSubmit={generalForm.handleSubmit(onSubmitGeneral)}
          className="space-y-4"
        >
          <FormField
            control={generalForm.control}
            name="queueWaitTime"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center gap-1">
                  <FormLabel className="text-foreground">
                    Queue Wait Time (minutes)
                  </FormLabel>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="h-4 w-4 text-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Time to wait before processing queued notifications.
                        Groups multiple episodes together.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value?.toString() ?? ''}
                    onChange={(e) =>
                      field.onChange(
                        e.currentTarget.value === ''
                          ? undefined
                          : e.currentTarget.valueAsNumber,
                      )
                    }
                    placeholder="Enter queue wait time"
                    type="number"
                    min="0"
                    max="5"
                    step={1}
                    disabled={generalStatus === 'loading'}
                    className="w-full"
                  />
                </FormControl>
                <FormMessage className="text-xs mt-1" />
              </FormItem>
            )}
          />

          <FormField
            control={generalForm.control}
            name="newEpisodeThreshold"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center gap-1">
                  <FormLabel className="text-foreground">
                    New Episode Threshold (hours)
                  </FormLabel>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="h-4 w-4 text-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Threshold for immediate notifications. Recent episodes
                        get instant alerts, older ones are batched.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value?.toString() ?? ''}
                    onChange={(e) =>
                      field.onChange(
                        e.currentTarget.value === ''
                          ? undefined
                          : e.currentTarget.valueAsNumber,
                      )
                    }
                    placeholder="Enter new episode threshold"
                    type="number"
                    min="0"
                    max="720"
                    step={1}
                    disabled={generalStatus === 'loading'}
                    className="w-full"
                  />
                </FormControl>
                <FormMessage className="text-xs mt-1" />
              </FormItem>
            )}
          />

          <FormField
            control={generalForm.control}
            name="upgradeBufferTime"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center gap-1">
                  <FormLabel className="text-foreground">
                    Upgrade Buffer Time (seconds)
                  </FormLabel>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="h-4 w-4 text-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Buffer time between quality upgrades to prevent
                        duplicate notifications.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value?.toString() ?? ''}
                    onChange={(e) =>
                      field.onChange(
                        e.currentTarget.value === ''
                          ? undefined
                          : e.currentTarget.valueAsNumber,
                      )
                    }
                    placeholder="Enter upgrade buffer time"
                    type="number"
                    min="0"
                    max="10"
                    step={1}
                    disabled={generalStatus === 'loading'}
                    className="w-full"
                  />
                </FormControl>
                <FormMessage className="text-xs mt-1" />
              </FormItem>
            )}
          />

          <div className="flex justify-end gap-2 mt-4">
            {isDirty && (
              <Button
                type="button"
                variant="cancel"
                onClick={resetForm}
                disabled={generalStatus === 'loading'}
                className="flex items-center gap-1"
              >
                <X className="h-4 w-4" />
                <span>Cancel</span>
              </Button>
            )}
            <Button
              type="submit"
              disabled={
                generalStatus === 'loading' || !isDirty || !isInitialized
              }
              className="flex items-center gap-2"
              variant="blue"
            >
              {generalStatus === 'loading' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : generalStatus === 'success' ? (
                <>
                  <Save className="h-4 w-4" />
                  <span>Saved</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>Save Changes</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}

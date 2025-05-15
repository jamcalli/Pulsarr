// src/client/features/notifications/components/general/general-settings-form.tsx
import { useEffect, useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Save, X, InfoIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { useConfigStore } from '@/stores/configStore'
import {
  generalFormSchema,
  type GeneralFormSchema,
} from '@/features/notifications/schemas/form-schemas'

interface GeneralSettingsFormProps {
  isInitialized: boolean
}

// Default values in milliseconds
const DEFAULT_QUEUE_WAIT_TIME = 120000 // 2 minutes
const DEFAULT_NEW_EPISODE_THRESHOLD = 172800000 // 48 hours (2 days)
const DEFAULT_UPGRADE_BUFFER_TIME = 2000 // 2 seconds

/**
 * Displays a form for editing general notification settings, including queue wait time, new episode threshold, and upgrade buffer time.
 *
 * Converts between user-facing units (minutes, hours, seconds) and internal millisecond storage. Provides validation, contextual tooltips, and feedback on submission status.
 *
 * @param isInitialized - Whether the configuration data has loaded and the form is ready for interaction.
 * @returns The React element for the general settings form.
 */
export function GeneralSettingsForm({
  isInitialized,
}: GeneralSettingsFormProps) {
  const { toast } = useToast()
  const config = useConfigStore((state) => state.config)
  const updateConfig = useConfigStore((state) => state.updateConfig)
  const [generalStatus, setGeneralStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')

  const generalForm = useForm<GeneralFormSchema>({
    resolver: zodResolver(generalFormSchema),
    defaultValues: {
      queueWaitTime: 0,
      newEpisodeThreshold: 0,
      upgradeBufferTime: 0,
      suppressRepairNotifications: false,
    },
  })

  // Helper functions to convert between storage and display units
  const getDisplayValues = useCallback((configData: typeof config) => {
    if (!configData) return null

    return {
      queueWaitTime: Math.round(
        (configData.queueWaitTime || DEFAULT_QUEUE_WAIT_TIME) / (60 * 1000),
      ),
      newEpisodeThreshold: Math.round(
        (configData.newEpisodeThreshold || DEFAULT_NEW_EPISODE_THRESHOLD) /
          (60 * 60 * 1000),
      ),
      upgradeBufferTime: Math.round(
        (configData.upgradeBufferTime || DEFAULT_UPGRADE_BUFFER_TIME) / 1000,
      ),
      suppressRepairNotifications:
        configData.suppressRepairNotifications ?? false,
    }
  }, [])

  // Convert milliseconds to appropriate display units
  useEffect(() => {
    const displayValues = getDisplayValues(config)
    if (displayValues) {
      generalForm.setValue('queueWaitTime', displayValues.queueWaitTime)
      generalForm.setValue(
        'newEpisodeThreshold',
        displayValues.newEpisodeThreshold,
      )
      generalForm.setValue('upgradeBufferTime', displayValues.upgradeBufferTime)
      generalForm.setValue(
        'suppressRepairNotifications',
        displayValues.suppressRepairNotifications,
      )

      generalForm.reset(displayValues)
    }
  }, [config, generalForm, getDisplayValues])

  const resetForm = () => {
    const displayValues = getDisplayValues(config)
    if (displayValues) {
      generalForm.reset(displayValues)
    }
  }

  const onSubmitGeneral = async (data: GeneralFormSchema) => {
    setGeneralStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

      // Convert back to milliseconds for storage
      const updatedConfig = {
        queueWaitTime:
          data.queueWaitTime !== undefined
            ? data.queueWaitTime * 60 * 1000
            : DEFAULT_QUEUE_WAIT_TIME,
        newEpisodeThreshold:
          data.newEpisodeThreshold !== undefined
            ? data.newEpisodeThreshold * 60 * 60 * 1000
            : DEFAULT_NEW_EPISODE_THRESHOLD,
        upgradeBufferTime:
          data.upgradeBufferTime !== undefined
            ? data.upgradeBufferTime * 1000
            : DEFAULT_UPGRADE_BUFFER_TIME,
        suppressRepairNotifications: data.suppressRepairNotifications ?? false,
      }

      await Promise.all([updateConfig(updatedConfig), minimumLoadingTime])

      setGeneralStatus('success')

      // Keep the display values in the form
      generalForm.reset(data)

      toast({
        description: 'General notification settings have been updated',
        variant: 'default',
      })

      setTimeout(() => {
        setGeneralStatus('idle')
      }, 1000)
    } catch (error) {
      console.error('General settings update error:', error)
      setGeneralStatus('error')
      toast({
        description: 'Failed to update general settings',
        variant: 'destructive',
      })

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
                  <FormLabel className="text-text">
                    Queue Wait Time (minutes)
                  </FormLabel>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="h-4 w-4 text-text cursor-help" />
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
                    placeholder="Enter queue wait time"
                    type="number"
                    min="0"
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
                  <FormLabel className="text-text">
                    New Episode Threshold (hours)
                  </FormLabel>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="h-4 w-4 text-text cursor-help" />
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
                    placeholder="Enter new episode threshold"
                    type="number"
                    min="0"
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
                  <FormLabel className="text-text">
                    Upgrade Buffer Time (seconds)
                  </FormLabel>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="h-4 w-4 text-text cursor-help" />
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
                    placeholder="Enter upgrade buffer time"
                    type="number"
                    min="0"
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
            name="suppressRepairNotifications"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center space-x-2">
                  <FormLabel className="text-text">
                    Suppress Repair Notifications
                  </FormLabel>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="h-4 w-4 text-text cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        When enabled, prevents notifications for content that
                        was already downloaded but is being re-grabbed (repair
                        operations).
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex h-10 items-center gap-2 px-3 py-2">
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={generalStatus === 'loading'}
                    />
                  </FormControl>
                  <span className="text-sm text-text text-muted-foreground">
                    Avoid duplicate notifications for repair operations
                  </span>
                </div>
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

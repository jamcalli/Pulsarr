// src/client/features/notifications/components/general/general-settings-form.tsx
import { useEffect, useState } from 'react'
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
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { Input } from '@/components/ui/input'
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
    },
  })

  // Convert milliseconds to appropriate display units
  useEffect(() => {
    if (config) {
      // Convert milliseconds to minutes for queueWaitTime
      const queueWaitTimeMinutes = Math.round(
        (config.queueWaitTime || DEFAULT_QUEUE_WAIT_TIME) / (60 * 1000),
      )

      // Convert milliseconds to hours for newEpisodeThreshold
      const newEpisodeThresholdHours = Math.round(
        (config.newEpisodeThreshold || DEFAULT_NEW_EPISODE_THRESHOLD) /
          (60 * 60 * 1000),
      )

      // Convert milliseconds to seconds for upgradeBufferTime
      const upgradeBufferTimeSeconds = Math.round(
        (config.upgradeBufferTime || DEFAULT_UPGRADE_BUFFER_TIME) / 1000,
      )

      generalForm.setValue('queueWaitTime', queueWaitTimeMinutes)
      generalForm.setValue('newEpisodeThreshold', newEpisodeThresholdHours)
      generalForm.setValue('upgradeBufferTime', upgradeBufferTimeSeconds)

      generalForm.reset({
        queueWaitTime: queueWaitTimeMinutes,
        newEpisodeThreshold: newEpisodeThresholdHours,
        upgradeBufferTime: upgradeBufferTimeSeconds,
      })
    }
  }, [config, generalForm])

  const resetForm = () => {
    if (config) {
      // Convert milliseconds to minutes for queueWaitTime
      const queueWaitTimeMinutes = Math.round(
        (config.queueWaitTime || DEFAULT_QUEUE_WAIT_TIME) / (60 * 1000),
      )

      // Convert milliseconds to hours for newEpisodeThreshold
      const newEpisodeThresholdHours = Math.round(
        (config.newEpisodeThreshold || DEFAULT_NEW_EPISODE_THRESHOLD) /
          (60 * 60 * 1000),
      )

      // Convert milliseconds to seconds for upgradeBufferTime
      const upgradeBufferTimeSeconds = Math.round(
        (config.upgradeBufferTime || DEFAULT_UPGRADE_BUFFER_TIME) / 1000,
      )

      generalForm.reset({
        queueWaitTime: queueWaitTimeMinutes,
        newEpisodeThreshold: newEpisodeThresholdHours,
        upgradeBufferTime: upgradeBufferTimeSeconds,
      })
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
                  <HoverCard>
                    <HoverCardTrigger asChild>
                      <InfoIcon className="h-4 w-4 text-text cursor-help" />
                    </HoverCardTrigger>
                    <HoverCardContent className="w-80">
                      <p>
                        Time to wait in milliseconds before processing queued
                        notification events. This is used when multiple episode
                        downloads are detected to group them together rather
                        than sending immediate individual notifications (2
                        minutes default).
                      </p>
                    </HoverCardContent>
                  </HoverCard>
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
                  <HoverCard>
                    <HoverCardTrigger asChild>
                      <InfoIcon className="h-4 w-4 text-text cursor-help" />
                    </HoverCardTrigger>
                    <HoverCardContent className="w-80">
                      <p>
                        Time threshold that determines how recently an episode
                        must have aired to receive immediate notifications.
                        Episodes that aired within this window (48 hours/2 days
                        default) trigger instant notifications, while older
                        episodes are batched together to reduce notification
                        spam.
                      </p>
                    </HoverCardContent>
                  </HoverCard>
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
                  <HoverCard>
                    <HoverCardTrigger asChild>
                      <InfoIcon className="h-4 w-4 text-text cursor-help" />
                    </HoverCardTrigger>
                    <HoverCardContent className="w-80">
                      <p>
                        Buffer time between file quality upgrades to prevent
                        duplicate notifications when Sonarr is upgrading the
                        same episode within a short timeframe (2 seconds
                        default).
                      </p>
                    </HoverCardContent>
                  </HoverCard>
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

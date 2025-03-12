// src/client/features/notifications/components/general/general-settings-form.tsx
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Save, InfoIcon } from 'lucide-react'
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

      setGeneralStatus('idle')

      // Keep the display values in the form
      generalForm.reset(data)

      toast({
        description: 'General notification settings have been updated',
        variant: 'default',
      })
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

  return (
    <div className="grid gap-4">
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
                      <InfoIcon className="h-4 w-4 text-black cursor-help" />
                    </HoverCardTrigger>
                    <HoverCardContent className="w-80">
                      <p>
                        Time to wait before processing queue items (in minutes)
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
                      <InfoIcon className="h-4 w-4 text-black cursor-help" />
                    </HoverCardTrigger>
                    <HoverCardContent className="w-80">
                      <p>
                        Time threshold for considering episodes as new (in
                        hours)
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
                      <InfoIcon className="h-4 w-4 text-black cursor-help" />
                    </HoverCardTrigger>
                    <HoverCardContent className="w-80">
                      <p>Buffer time between upgrades (in seconds)</p>
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

          <Button
            type="submit"
            disabled={
              generalStatus === 'loading' ||
              !generalForm.formState.isDirty ||
              !isInitialized
            }
            className="mt-4 flex items-center gap-2"
            variant="blue"
          >
            {generalStatus === 'loading' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="portrait:hidden">Saving...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span className="portrait:hidden">Save Changes</span>
              </>
            )}
          </Button>
        </form>
      </Form>
    </div>
  )
}

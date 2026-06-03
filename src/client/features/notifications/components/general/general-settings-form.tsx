// src/client/features/notifications/components/general/general-settings-form.tsx

import { zodResolver } from '@hookform/resolvers/zod'
import { ConfigUpdateSchema } from '@root/schemas/config/config.schema'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useConfigStore } from '@/stores/configStore'

// Frontend form schema with user-friendly validation (before conversion to milliseconds)
const generalFormSchema = z.object({
  queueWaitTime: z.coerce
    .number()
    .int()
    .min(0, { error: 'Queue wait time must be at least 0 minutes' })
    .max(30, { error: 'Queue wait time cannot exceed 30 minutes' })
    .optional(),
  newEpisodeThreshold: z.coerce
    .number()
    .int()
    .min(0, { error: 'New episode threshold must be at least 0 hours' })
    .max(720, {
      error: 'New episode threshold cannot exceed 720 hours (1 month)',
    })
    .optional(),
  notifyOnUpdate: ConfigUpdateSchema.shape.notifyOnUpdate,
  notifyOnAvailability: ConfigUpdateSchema.shape.notifyOnAvailability,
  watchlistAddNotify: ConfigUpdateSchema.shape.watchlistAddNotify,
})

interface GeneralSettingsFormProps {
  isInitialized: boolean
}

// Default values in milliseconds
const DEFAULT_QUEUE_WAIT_TIME = 120000 // 2 minutes
const DEFAULT_NEW_EPISODE_THRESHOLD = 172800000 // 48 hours (2 days)

// Time fields are edited in user-friendly units and converted to milliseconds
// on submit. isInitialized gates submission until config has loaded.
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
    defaultValues: {
      notifyOnUpdate: 'none',
      notifyOnAvailability: true,
      watchlistAddNotify: 'all',
    },
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
      notifyOnUpdate: configData.notifyOnUpdate ?? 'none',
      notifyOnAvailability: configData.notifyOnAvailability ?? true,
      watchlistAddNotify: configData.watchlistAddNotify ?? 'all',
    }
  }, [])

  // Convert milliseconds to appropriate display units
  useEffect(() => {
    const displayValues = getDisplayValues(config)
    if (!displayValues) return

    generalForm.reset(displayValues, { keepDirty: false })

    // Controlled Radix Selects ignore a value applied in the same tick as mount,
    // so re-apply the Select values on the next tick and commit a clean baseline.
    setTimeout(() => {
      generalForm.setValue('notifyOnUpdate', displayValues.notifyOnUpdate, {
        shouldDirty: false,
      })
      generalForm.setValue(
        'watchlistAddNotify',
        displayValues.watchlistAddNotify,
        { shouldDirty: false },
      )
      generalForm.reset(generalForm.getValues(), { keepDirty: false })
    }, 0)
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
        notifyOnUpdate: transformedData.notifyOnUpdate ?? 'none',
        notifyOnAvailability: transformedData.notifyOnAvailability ?? true,
        watchlistAddNotify: transformedData.watchlistAddNotify ?? 'all',
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
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoIcon className="h-4 w-4 text-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Time to wait before processing queued notifications.
                      Groups multiple episodes together.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value?.toString() ?? ''}
                    onChange={(e) => {
                      const v = e.currentTarget.valueAsNumber
                      field.onChange(
                        e.currentTarget.value === '' || Number.isNaN(v)
                          ? undefined
                          : v,
                      )
                    }}
                    placeholder="Enter queue wait time"
                    type="number"
                    min="0"
                    max="30"
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
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoIcon className="h-4 w-4 text-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Threshold for immediate notifications. Recent episodes get
                      instant alerts, older ones are batched.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value?.toString() ?? ''}
                    onChange={(e) => {
                      const v = e.currentTarget.valueAsNumber
                      field.onChange(
                        e.currentTarget.value === '' || Number.isNaN(v)
                          ? undefined
                          : v,
                      )
                    }}
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
            name="notifyOnUpdate"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center gap-1">
                  <FormLabel className="text-foreground">
                    Update Notifications
                  </FormLabel>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoIcon className="h-4 w-4 text-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="max-w-xs">
                        <p>
                          Controls how Pulsarr release notifications are sent
                          when a new version is detected on GitHub. Pulsarr is
                          not upgraded automatically.
                        </p>
                        <ul className="list-disc pl-4 text-sm mt-1">
                          <li>
                            All Channels: Send to all notification methods
                          </li>
                          <li>Apprise Only: Only use Apprise</li>
                          <li>
                            Discord (Webhook + DM): Send to both Discord webhook
                            and admin DM
                          </li>
                          <li>
                            Discord (DM Only): Send only to admin Discord DM
                          </li>
                          <li>
                            Discord (Webhook Only): Send only to Discord webhook
                          </li>
                          <li>None: No notifications</li>
                        </ul>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={generalStatus === 'loading'}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select notification type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="all">All Channels</SelectItem>
                    <SelectItem value="apprise-only">Apprise Only</SelectItem>
                    <SelectItem value="discord-only">
                      Discord (Webhook + DM)
                    </SelectItem>
                    <SelectItem value="dm-only">Discord (DM Only)</SelectItem>
                    <SelectItem value="webhook-only">
                      Discord (Webhook Only)
                    </SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={generalForm.control}
            name="watchlistAddNotify"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center gap-1">
                  <FormLabel className="text-foreground">
                    Watchlist Add Notifications
                  </FormLabel>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoIcon className="h-4 w-4 text-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="max-w-xs">
                        <p>
                          Controls how admins are notified when a user adds
                          content to their watchlist.
                        </p>
                        <ul className="list-disc pl-4 text-sm mt-1">
                          <li>
                            All Channels: Send to all notification methods
                          </li>
                          <li>Apprise Only: Only use Apprise</li>
                          <li>
                            Discord (Webhook + DM): Send to both Discord webhook
                            and admin DM
                          </li>
                          <li>
                            Discord (DM Only): Send only to admin Discord DM
                          </li>
                          <li>
                            Discord (Webhook Only): Send only to Discord webhook
                          </li>
                          <li>None: No notifications</li>
                        </ul>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={generalStatus === 'loading'}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select notification type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="all">All Channels</SelectItem>
                    <SelectItem value="apprise-only">Apprise Only</SelectItem>
                    <SelectItem value="discord-both">
                      Discord (Webhook + DM)
                    </SelectItem>
                    <SelectItem value="dm-only">Discord (DM Only)</SelectItem>
                    <SelectItem value="webhook-only">
                      Discord (Webhook Only)
                    </SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={generalForm.control}
            name="notifyOnAvailability"
            render={({ field }) => (
              <FormItem className="flex items-center space-x-2">
                <FormControl>
                  <Switch
                    checked={field.value ?? true}
                    onCheckedChange={field.onChange}
                    disabled={generalStatus === 'loading'}
                  />
                </FormControl>
                <div className="flex items-center">
                  <FormLabel className="text-foreground m-0">
                    Availability Notifications
                  </FormLabel>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoIcon className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        When enabled, users are notified when their watchlisted
                        content becomes available, across all their configured
                        channels (Discord DM, Apprise, Plex mobile). Disable
                        this if your users already get availability alerts from
                        Sonarr or Radarr.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <FormMessage />
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

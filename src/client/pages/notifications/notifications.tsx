import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Check, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { useConfigStore } from '@/stores/configStore'
import { DiscordStatusBadge } from '@/components/ui/discord-bot-status-badge'

const discordFormSchema = z.object({
  discordWebhookUrl: z.string().optional(),
  discordBotToken: z.string().optional(),
  discordClientId: z.string().optional(),
  discordGuildId: z.string().optional(),
})

const generalFormSchema = z.object({
  queueWaitTime: z.coerce.number().int().min(0).optional(),
  newEpisodeThreshold: z.coerce.number().int().min(0).optional(),
  upgradeBufferTime: z.coerce.number().int().min(0).optional(),
})

type DiscordFormSchema = z.infer<typeof discordFormSchema>
type GeneralFormSchema = z.infer<typeof generalFormSchema>

export function NotificationsConfigPage() {
  const { toast } = useToast()
  const config = useConfigStore((state) => state.config)
  const updateConfig = useConfigStore((state) => state.updateConfig)
  const initialize = useConfigStore((state) => state.initialize)

  const [isInitialized, setIsInitialized] = React.useState(false)
  const [discordStatus, setDiscordStatus] = React.useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [generalStatus, setGeneralStatus] = React.useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')

  React.useEffect(() => {
    initialize()
  }, [initialize])

  const discordForm = useForm<DiscordFormSchema>({
    resolver: zodResolver(discordFormSchema),
    defaultValues: {
      discordWebhookUrl: '',
      discordBotToken: '',
      discordClientId: '',
      discordGuildId: '',
    },
  })

  const generalForm = useForm<GeneralFormSchema>({
    resolver: zodResolver(generalFormSchema),
    defaultValues: {
      queueWaitTime: 0,
      newEpisodeThreshold: 0,
      upgradeBufferTime: 0,
    },
  })

  React.useEffect(() => {
    if (config) {
      discordForm.setValue('discordWebhookUrl', config.discordWebhookUrl || '')
      discordForm.setValue('discordBotToken', config.discordBotToken || '')
      discordForm.setValue('discordClientId', config.discordClientId || '')
      discordForm.setValue('discordGuildId', config.discordGuildId || '')

      generalForm.setValue('queueWaitTime', config.queueWaitTime || 0)
      generalForm.setValue(
        'newEpisodeThreshold',
        config.newEpisodeThreshold || 0,
      )
      generalForm.setValue('upgradeBufferTime', config.upgradeBufferTime || 0)

      setIsInitialized(true)
    }
  }, [config, discordForm, generalForm])

  const onSubmitDiscord = async (data: DiscordFormSchema) => {
    setDiscordStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

      await Promise.all([
        updateConfig({
          discordWebhookUrl: data.discordWebhookUrl,
          discordBotToken: data.discordBotToken,
          discordClientId: data.discordClientId,
          discordGuildId: data.discordGuildId,
        }),
        minimumLoadingTime,
      ])

      setDiscordStatus('success')
      toast({
        description: 'Discord notification settings have been updated',
        variant: 'default',
      })

      // Show success state for a moment
      await new Promise((resolve) => setTimeout(resolve, 300))
      setDiscordStatus('idle')
    } catch (error) {
      console.error('Discord settings update error:', error)
      setDiscordStatus('error')
      toast({
        description: 'Failed to update Discord settings',
        variant: 'destructive',
      })

      // Reset status after error is shown
      await new Promise((resolve) => setTimeout(resolve, 1000))
      setDiscordStatus('idle')
    }
  }

  const onSubmitGeneral = async (data: GeneralFormSchema) => {
    setGeneralStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

      await Promise.all([
        updateConfig({
          queueWaitTime: data.queueWaitTime,
          newEpisodeThreshold: data.newEpisodeThreshold,
          upgradeBufferTime: data.upgradeBufferTime,
        }),
        minimumLoadingTime,
      ])

      setGeneralStatus('success')
      toast({
        description: 'General notification settings have been updated',
        variant: 'default',
      })

      // Show success state for a moment
      await new Promise((resolve) => setTimeout(resolve, 300))
      setGeneralStatus('idle')
    } catch (error) {
      console.error('General settings update error:', error)
      setGeneralStatus('error')
      toast({
        description: 'Failed to update general settings',
        variant: 'destructive',
      })

      // Reset status after error is shown
      await new Promise((resolve) => setTimeout(resolve, 1000))
      setGeneralStatus('idle')
    }
  }

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <div className="grid gap-6">
        {/* Discord Notifications Section */}
        <div>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <h2 className="text-2xl font-bold text-text">
                Discord Notifications
              </h2>
              <DiscordStatusBadge />
            </div>
          </div>
          <div className="grid gap-4 mt-4">
            <Form {...discordForm}>
              <form
                onSubmit={discordForm.handleSubmit(onSubmitDiscord)}
                className="space-y-4"
              >
                <FormField
                  control={discordForm.control}
                  name="discordWebhookUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-text">
                        Discord Webhook URL
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Enter Discord Webhook URL"
                          type="text"
                          disabled={discordStatus === 'loading'}
                          className="w-full"
                        />
                      </FormControl>
                      <FormMessage className="text-xs mt-1" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={discordForm.control}
                  name="discordBotToken"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-text">
                        Discord Bot Token
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Enter Discord Bot Token"
                          type="password"
                          disabled={discordStatus === 'loading'}
                          className="w-full"
                        />
                      </FormControl>
                      <FormMessage className="text-xs mt-1" />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={discordForm.control}
                    name="discordClientId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-text">
                          Discord Client ID
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Enter Discord Client ID"
                            type="text"
                            disabled={discordStatus === 'loading'}
                            className="w-full"
                          />
                        </FormControl>
                        <FormMessage className="text-xs mt-1" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={discordForm.control}
                    name="discordGuildId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-text">
                          Discord Guild ID
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Enter Discord Guild ID"
                            type="text"
                            disabled={discordStatus === 'loading'}
                            className="w-full"
                          />
                        </FormControl>
                        <FormMessage className="text-xs mt-1" />
                      </FormItem>
                    )}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={
                    discordStatus !== 'idle' || !discordForm.formState.isDirty
                  }
                  className="mt-4 min-w-[100px] flex items-center justify-center gap-2"
                  variant="default"
                >
                  {discordStatus === 'loading' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : discordStatus === 'success' ? (
                    <>
                      <Check className="h-4 w-4" />
                      Saved
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </form>
            </Form>
          </div>
        </div>

        {/* Email Notifications Section */}
        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-text">
              Email Notifications
            </h2>
          </div>
          <div className="grid gap-4 mt-4">
            <div className="p-6 bg-gray-100 dark:bg-gray-800 rounded-lg text-center">
              <p className="text-muted-foreground">
                Email notification settings are not yet implemented in the
                backend. Check back later for this feature.
              </p>
            </div>
          </div>
        </div>

        {/* General Notifications Section */}
        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-text">
              General Notification Settings
            </h2>
          </div>
          <div className="grid gap-4 mt-4">
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
                      <FormLabel className="text-text">
                        Queue Wait Time (seconds)
                      </FormLabel>
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
                      <FormLabel className="text-text">
                        New Episode Threshold (minutes)
                      </FormLabel>
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
                      <FormLabel className="text-text">
                        Upgrade Buffer Time (minutes)
                      </FormLabel>
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
                    generalStatus !== 'idle' || !generalForm.formState.isDirty
                  }
                  className="mt-4 min-w-[100px] flex items-center justify-center gap-2"
                  variant="default"
                >
                  {generalStatus === 'loading' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : generalStatus === 'success' ? (
                    <>
                      <Check className="h-4 w-4" />
                      Saved
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </form>
            </Form>
          </div>
        </div>
      </div>
    </div>
  )
}

export default NotificationsConfigPage

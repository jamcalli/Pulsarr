import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Save, CheckCircle } from 'lucide-react'
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

// Separate webhook schema
const webhookFormSchema = z.object({
  discordWebhookUrl: z.string().optional(),
})

// Discord bot schema
const discordBotFormSchema = z.object({
  discordBotToken: z.string().optional(),
  discordClientId: z.string().optional(),
  discordGuildId: z.string().optional(),
})

const generalFormSchema = z.object({
  queueWaitTime: z.coerce.number().int().min(0).optional(),
  newEpisodeThreshold: z.coerce.number().int().min(0).optional(),
  upgradeBufferTime: z.coerce.number().int().min(0).optional(),
})

type WebhookFormSchema = z.infer<typeof webhookFormSchema>
type DiscordBotFormSchema = z.infer<typeof discordBotFormSchema>
type GeneralFormSchema = z.infer<typeof generalFormSchema>

export function NotificationsConfigPage() {
  const { toast } = useToast()
  const config = useConfigStore((state) => state.config)
  const updateConfig = useConfigStore((state) => state.updateConfig)
  const initialize = useConfigStore((state) => state.initialize)

  const [isInitialized, setIsInitialized] = React.useState(false)
  const [webhookStatus, setWebhookStatus] = React.useState<
    'idle' | 'loading' | 'testing' | 'success' | 'error'
  >('idle')
  const [webhookTestValid, setWebhookTestValid] = React.useState(true)
  const [discordBotStatus, setDiscordBotStatus] = React.useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [generalStatus, setGeneralStatus] = React.useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')

  React.useEffect(() => {
    initialize()
  }, [initialize])

  // Function to validate Discord webhook URL
  const validateDiscordWebhook = async (url: string) => {
    try {
      if (!url || !url.includes('discord.com/api/webhooks')) {
        return { valid: false, error: 'Invalid webhook URL format' }
      }

      // Perform a GET request to the webhook URL
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      // Check if the response is ok (status in the range 200-299)
      if (response.ok) {
        const data = await response.json()

        // If we can get the webhook details, it's valid
        if (data?.id && data.token) {
          return { valid: true, webhook: data }
        }
      }

      return { valid: false, error: 'Invalid webhook URL' }
    } catch (error) {
      console.error('Webhook validation error:', error)
      return { valid: false, error: 'Error validating webhook' }
    }
  }

  const testWebhook = async () => {
    const webhookUrl = webhookForm.getValues('discordWebhookUrl')

    if (!webhookUrl) {
      toast({
        description: 'Please enter a webhook URL to test',
        variant: 'destructive',
      })
      return
    }

    setWebhookStatus('testing')
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

      const [result] = await Promise.all([
        validateDiscordWebhook(webhookUrl),
        minimumLoadingTime,
      ])

      if (result.valid) {
        setWebhookTestValid(true)
        toast({
          description: 'Discord webhook URL is valid!',
          variant: 'default',
        })
      } else {
        setWebhookTestValid(false)
        toast({
          description: `Webhook validation failed: ${result.error}`,
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('Webhook test error:', error)
      setWebhookTestValid(false)
      toast({
        description: 'Failed to validate webhook URL',
        variant: 'destructive',
      })
    } finally {
      setWebhookStatus('idle')
    }
  }

  const webhookForm = useForm<WebhookFormSchema>({
    resolver: zodResolver(webhookFormSchema),
    defaultValues: {
      discordWebhookUrl: '',
    },
  })

  React.useEffect(() => {
    const subscription = webhookForm.watch((_, { name }) => {
      if (name === 'discordWebhookUrl') {
        setWebhookTestValid(true)
      }
    })

    return () => subscription.unsubscribe()
  }, [webhookForm])

  const discordBotForm = useForm<DiscordBotFormSchema>({
    resolver: zodResolver(discordBotFormSchema),
    defaultValues: {
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
      webhookForm.setValue('discordWebhookUrl', config.discordWebhookUrl || '')
      webhookForm.reset({ discordWebhookUrl: config.discordWebhookUrl || '' })

      discordBotForm.setValue('discordBotToken', config.discordBotToken || '')
      discordBotForm.setValue('discordClientId', config.discordClientId || '')
      discordBotForm.setValue('discordGuildId', config.discordGuildId || '')
      discordBotForm.reset({
        discordBotToken: config.discordBotToken || '',
        discordClientId: config.discordClientId || '',
        discordGuildId: config.discordGuildId || '',
      })

      generalForm.setValue('queueWaitTime', config.queueWaitTime || 0)
      generalForm.setValue(
        'newEpisodeThreshold',
        config.newEpisodeThreshold || 0,
      )
      generalForm.setValue('upgradeBufferTime', config.upgradeBufferTime || 0)
      generalForm.reset({
        queueWaitTime: config.queueWaitTime || 0,
        newEpisodeThreshold: config.newEpisodeThreshold || 0,
        upgradeBufferTime: config.upgradeBufferTime || 0,
      })

      setIsInitialized(true)
    }
  }, [config, webhookForm, discordBotForm, generalForm])

  const onSubmitWebhook = async (data: WebhookFormSchema) => {
    setWebhookStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

      await Promise.all([
        updateConfig({
          discordWebhookUrl: data.discordWebhookUrl,
        }),
        minimumLoadingTime,
      ])

      setWebhookStatus('idle')
      // Reset form's dirty state
      webhookForm.reset(data)
      toast({
        description: 'Discord webhook URL has been updated',
        variant: 'default',
      })
    } catch (error) {
      console.error('Discord webhook update error:', error)
      setWebhookStatus('error')
      toast({
        description: 'Failed to update Discord webhook',
        variant: 'destructive',
      })

      await new Promise((resolve) => setTimeout(resolve, 1000))
      setWebhookStatus('idle')
    }
  }

  const onSubmitDiscordBot = async (data: DiscordBotFormSchema) => {
    setDiscordBotStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

      await Promise.all([
        updateConfig({
          discordBotToken: data.discordBotToken,
          discordClientId: data.discordClientId,
          discordGuildId: data.discordGuildId,
        }),
        minimumLoadingTime,
      ])

      setDiscordBotStatus('idle')
      // Reset form's dirty state
      discordBotForm.reset(data)
      toast({
        description: 'Discord bot settings have been updated',
        variant: 'default',
      })
    } catch (error) {
      console.error('Discord bot settings update error:', error)
      setDiscordBotStatus('error')
      toast({
        description: 'Failed to update Discord bot settings',
        variant: 'destructive',
      })

      await new Promise((resolve) => setTimeout(resolve, 1000))
      setDiscordBotStatus('idle')
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

      setGeneralStatus('idle')
      // Reset form's dirty state
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
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <div className="grid gap-6">
        {/* Discord Notifications Section */}
        <div>
          <h2 className="text-2xl font-bold text-text">
            Discord Notifications
          </h2>

          {/* Discord Webhook Section */}
          <div className="grid gap-4 mt-4">
            <h3 className="text-xl font-semibold text-text">Discord Webhook</h3>
            <Form {...webhookForm}>
              <form
                onSubmit={webhookForm.handleSubmit(onSubmitWebhook)}
                className="space-y-4"
              >
                <FormField
                  control={webhookForm.control}
                  name="discordWebhookUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-text">
                        Discord Webhook URL
                      </FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Input
                            {...field}
                            placeholder="Enter Discord Webhook URL"
                            type="text"
                            disabled={
                              webhookStatus === 'loading' ||
                              webhookStatus === 'testing'
                            }
                            className="w-full"
                          />
                          <Button
                            type="button"
                            onClick={testWebhook}
                            disabled={
                              webhookStatus === 'loading' ||
                              webhookStatus === 'testing' ||
                              !field.value
                            }
                            variant="noShadow"
                            className="shrink-0"
                          >
                            {webhookStatus === 'testing' ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                <span>Testing</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle className="h-4 w-4 mr-1" />
                                <span>Test</span>
                              </>
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage className="text-xs mt-1" />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  disabled={
                    webhookStatus === 'loading' ||
                    webhookStatus === 'testing' ||
                    !webhookForm.formState.isDirty ||
                    !isInitialized ||
                    !webhookTestValid
                  }
                  className="mt-4 flex items-center gap-2"
                  variant="blue"
                >
                  {webhookStatus === 'loading' ? (
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

          {/* Discord Bot Section */}
          <div className="grid gap-4 mt-6">
            <div className="flex items-center">
              <h3 className="text-xl font-semibold text-text">
                Discord Bot Settings
              </h3>
              <DiscordStatusBadge />
            </div>
            <Form {...discordBotForm}>
              <form
                onSubmit={discordBotForm.handleSubmit(onSubmitDiscordBot)}
                className="space-y-4"
              >
                <FormField
                  control={discordBotForm.control}
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
                          disabled={discordBotStatus === 'loading'}
                          className="w-full"
                        />
                      </FormControl>
                      <FormMessage className="text-xs mt-1" />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={discordBotForm.control}
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
                            disabled={discordBotStatus === 'loading'}
                            className="w-full"
                          />
                        </FormControl>
                        <FormMessage className="text-xs mt-1" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={discordBotForm.control}
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
                            disabled={discordBotStatus === 'loading'}
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
                    discordBotStatus === 'loading' ||
                    !discordBotForm.formState.isDirty ||
                    !isInitialized
                  }
                  className="mt-4 flex items-center gap-2"
                  variant="blue"
                >
                  {discordBotStatus === 'loading' ? (
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
        </div>
      </div>
    </div>
  )
}

export default NotificationsConfigPage

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
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
import {
  webhookFormSchema,
  type WebhookFormSchema,
} from '@/features/notifications/schemas/form-schemas'

interface DiscordWebhookFormProps {
  isInitialized: boolean
}

export function DiscordWebhookForm({ isInitialized }: DiscordWebhookFormProps) {
  const { toast } = useToast()
  const config = useConfigStore((state) => state.config)
  const updateConfig = useConfigStore((state) => state.updateConfig)
  const [webhookStatus, setWebhookStatus] = React.useState<
    'idle' | 'loading' | 'testing' | 'success' | 'error'
  >('idle')
  const [webhookTestValid, setWebhookTestValid] = React.useState(true)

  const webhookForm = useForm<WebhookFormSchema>({
    resolver: zodResolver(webhookFormSchema),
    defaultValues: {
      discordWebhookUrl: '',
    },
  })

  React.useEffect(() => {
    if (config) {
      webhookForm.setValue('discordWebhookUrl', config.discordWebhookUrl || '')
      webhookForm.reset({ discordWebhookUrl: config.discordWebhookUrl || '' })
    }
  }, [config, webhookForm])

  React.useEffect(() => {
    const subscription = webhookForm.watch((_, { name }) => {
      if (name === 'discordWebhookUrl') {
        setWebhookTestValid(true)
      }
    })

    return () => subscription.unsubscribe()
  }, [webhookForm])

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

  return (
    <div className="grid gap-4">
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
                <FormLabel className="text-text">Discord Webhook URL</FormLabel>
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
  )
}

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Save, Check, InfoIcon, X, Trash2 } from 'lucide-react'
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
import { useToast } from '@/hooks/use-toast'
import { useConfigStore } from '@/stores/configStore'
import {
  webhookFormSchema,
  type WebhookFormSchema,
} from '@/features/notifications/schemas/form-schemas'
import { DiscordClearAlert } from '@/features/notifications/components/discord/discord-clear-alert'

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
  const [webhookTestValid, setWebhookTestValid] = React.useState(false)
  const [_webhookTested, setWebhookTested] = React.useState(false)
  const [showClearAlert, setShowClearAlert] = React.useState(false)

  const webhookForm = useForm<WebhookFormSchema>({
    resolver: zodResolver(webhookFormSchema),
    defaultValues: {
      discordWebhookUrl: '',
      _connectionTested: false,
    },
    mode: 'onChange',
  })

  React.useEffect(() => {
    if (config) {
      webhookForm.setValue('discordWebhookUrl', config.discordWebhookUrl || '')
      webhookForm.setValue('_connectionTested', false)
      webhookForm.reset({
        discordWebhookUrl: config.discordWebhookUrl || '',
        _connectionTested: false,
      })
    }
  }, [config, webhookForm])

  React.useEffect(() => {
    const subscription = webhookForm.watch(() => {
      if (webhookForm.formState.isDirty) {
        webhookForm.trigger()
      }
    })

    return () => subscription.unsubscribe()
  }, [webhookForm])

  React.useEffect(() => {
    const subscription = webhookForm.watch((_, { name }) => {
      if (name === 'discordWebhookUrl') {
        setWebhookTested(false)
        setWebhookTestValid(false)
        webhookForm.setValue('_connectionTested', false, {
          shouldValidate: true,
        })

        const url = webhookForm.getValues('discordWebhookUrl')
        if (url && url.length > 0) {
          webhookForm.setError('discordWebhookUrl', {
            type: 'manual',
            message: 'Please test connection before saving',
          })
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [webhookForm])

  const resetForm = () => {
    if (config) {
      webhookForm.reset({
        discordWebhookUrl: config.discordWebhookUrl || '',
        _connectionTested: false,
      })
      setWebhookTested(false)
      setWebhookTestValid(false)
    }
  }

  // Function to validate Discord webhook URLs (supports comma-separated URLs)
  const validateDiscordWebhook = async (urlInput: string) => {
    try {
      // Trim the input and treat whitespace-only as empty
      const trimmed = urlInput?.trim() ?? ''
      if (trimmed.length === 0) {
        return { valid: false, error: 'No webhook URLs provided' }
      }

      // Call our backend validation endpoint
      const response = await fetch('/v1/notifications/validatewebhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ webhookUrls: trimmed }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        return {
          valid: false,
          error: errorData.message || 'Error validating webhooks',
        }
      }

      const result = await response.json()

      // Map the server response to the expected format
      if (!result.valid) {
        // Get invalid URLs
        const invalidUrls = result.urls
          .filter((url: { valid: boolean }) => !url.valid)
          .map((url: { url: string }) => url.url)
          .join(', ')

        const singularOrPlural = invalidUrls.split(',').length === 1 ? '' : 's'
        return {
          valid: false,
          error: `Invalid webhook URL${singularOrPlural}: ${invalidUrls}`,
        }
      }

      // All webhooks are valid
      return {
        valid: true,
        webhooks: result.urls.map((url: { url: string }) => ({
          id: url.url.split('/').slice(-2, -1)[0],
          token: url.url.split('/').slice(-1)[0],
        })),
        count: result.urls.length,
        originalCount: result.urls.length + (result.duplicateCount || 0),
        duplicateCount: result.duplicateCount || 0,
      }
    } catch (error) {
      console.error('Webhook validation error:', error)
      return { valid: false, error: 'Error validating webhooks' }
    }
  }

  const testWebhook = async () => {
    const webhookUrls = webhookForm.getValues('discordWebhookUrl')

    if (!webhookUrls) {
      toast({
        description: 'Please enter webhook URLs to test',
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
        validateDiscordWebhook(webhookUrls),
        minimumLoadingTime,
      ])

      setWebhookTested(true)

      if (result.valid) {
        setWebhookTestValid(true)
        webhookForm.setValue('_connectionTested', true, {
          shouldValidate: true,
        })
        webhookForm.clearErrors('discordWebhookUrl')

        // Get webhook count for user feedback
        const webhookCount = result.count || 1
        let countText =
          webhookCount === 1
            ? 'Discord webhook URL is valid!'
            : `All ${webhookCount} Discord webhook URLs are valid!`

        // Add information about duplicates if any were found
        if (result.duplicateCount && result.duplicateCount > 0) {
          countText += ` (${result.duplicateCount} duplicate ${
            result.duplicateCount === 1 ? 'URL was' : 'URLs were'
          } removed)`
        }

        toast({
          description: countText,
          variant: 'default',
        })
      } else {
        setWebhookTestValid(false)
        webhookForm.setValue('_connectionTested', false, {
          shouldValidate: true,
        })
        webhookForm.setError('discordWebhookUrl', {
          type: 'manual',
          message: 'Please test connection before saving',
        })
        toast({
          description: `Webhook validation failed: ${result.error}`,
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('Webhook test error:', error)
      setWebhookTestValid(false)
      webhookForm.setValue('_connectionTested', false, { shouldValidate: true })
      webhookForm.setError('discordWebhookUrl', {
        type: 'manual',
        message: 'Please test connection before saving',
      })
      toast({
        description: 'Failed to validate webhook URLs',
        variant: 'destructive',
      })
    } finally {
      setWebhookStatus('idle')
    }
  }

  const onSubmitWebhook = async (data: WebhookFormSchema) => {
    if (!webhookTestValid) {
      webhookForm.setError('discordWebhookUrl', {
        type: 'manual',
        message: 'Please test the connection before saving',
      })
      return
    }

    setWebhookStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

      // Deduplicate URLs before saving
      let webhookUrls = data.discordWebhookUrl
      if (webhookUrls) {
        // Trim the input first to handle whitespace-only input
        const trimmedInput = webhookUrls.trim()

        if (trimmedInput.length === 0) {
          // If it's just whitespace, save as empty string
          webhookUrls = ''
        } else {
          // Split, trim, filter empty and deduplicate
          const uniqueUrls = [
            ...new Set(
              trimmedInput
                .split(',')
                .map((url: string) => url.trim())
                .filter((url: string) => url.length > 0),
            ),
          ]

          // Join back to comma-separated string
          webhookUrls = uniqueUrls.join(',')
        }
      }

      await Promise.all([
        updateConfig({
          discordWebhookUrl: webhookUrls,
        }),
        minimumLoadingTime,
      ])

      setWebhookStatus('success')
      // Reset form's dirty state
      webhookForm.reset({
        ...data,
        _connectionTested: true,
      })
      toast({
        description: 'Discord webhook URL has been updated',
        variant: 'default',
      })

      setTimeout(() => {
        setWebhookStatus('idle')
      }, 1000)
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

  const handleClearWebhook = async () => {
    setWebhookStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

      // Use empty string exactly like the bot function does
      await Promise.all([
        updateConfig({
          discordWebhookUrl: '',
        }),
        minimumLoadingTime,
      ])

      setWebhookStatus('success')
      webhookForm.reset({
        discordWebhookUrl: '',
        _connectionTested: false,
      })
      setWebhookTested(false)
      setWebhookTestValid(false)

      toast({
        description: 'Discord webhook URL has been cleared',
        variant: 'default',
      })

      setTimeout(() => {
        setWebhookStatus('idle')
      }, 1000)
    } catch (error) {
      console.error('Discord webhook clear error:', error)
      setWebhookStatus('error')
      toast({
        description: 'Failed to clear Discord webhook',
        variant: 'destructive',
      })

      await new Promise((resolve) => setTimeout(resolve, 1000))
      setWebhookStatus('idle')
    }
  }

  const isDirty = webhookForm.formState.isDirty
  const webhookFieldState = webhookForm.getFieldState('discordWebhookUrl')
  const showTestError =
    webhookFieldState.isDirty && !webhookTestValid && isDirty

  const hasWebhookUrl = !!webhookForm.watch('discordWebhookUrl')

  return (
    <div className="grid gap-4">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold text-text">Discord Webhook</h3>
      </div>

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
                <div className="flex items-center gap-1">
                  <FormLabel className="text-text">
                    System Discord Webhook URL(s)
                  </FormLabel>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="h-4 w-4 text-text cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Discord webhook URL(s) for sending system notifications.
                        Multiple URLs can be separated by commas.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <FormControl>
                  <div className="flex gap-2">
                    <Input
                      {...field}
                      placeholder="Enter Discord Webhook URL(s), separate multiple with commas"
                      type="text"
                      disabled={
                        webhookStatus === 'loading' ||
                        webhookStatus === 'testing'
                      }
                      className="w-full"
                    />
                    <TooltipProvider>
                      <Tooltip open={showTestError || undefined}>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            onClick={testWebhook}
                            disabled={
                              webhookStatus === 'loading' ||
                              webhookStatus === 'testing' ||
                              !field.value
                            }
                            size="icon"
                            variant="noShadow"
                            className="shrink-0"
                          >
                            {webhookStatus === 'testing' ? (
                              <Loader2 className="animate-spin" />
                            ) : webhookTestValid ? (
                              <Check className="text-black" />
                            ) : (
                              <Check />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent
                          className={showTestError ? 'bg-error text-black' : ''}
                        >
                          <p>Test connection</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </FormControl>
                {showTestError && (
                  <FormMessage className="text-xs mt-1">
                    Please test connection before saving
                  </FormMessage>
                )}
              </FormItem>
            )}
          />

          <div className="flex justify-end gap-2 mt-4">
            {isDirty && (
              <Button
                type="button"
                variant="cancel"
                onClick={resetForm}
                disabled={
                  webhookStatus === 'loading' || webhookStatus === 'testing'
                }
                className="flex items-center gap-1"
              >
                <X className="h-4 w-4" />
                <span>Cancel</span>
              </Button>
            )}

            <Button
              type="submit"
              disabled={
                webhookStatus === 'loading' ||
                webhookStatus === 'testing' ||
                !isDirty ||
                !isInitialized ||
                !webhookTestValid // Disable if test hasn't passed
              }
              className="flex items-center gap-2"
              variant="blue"
            >
              {webhookStatus === 'loading' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : webhookStatus === 'success' ? (
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

            {hasWebhookUrl && (
              <Button
                variant="error"
                size="icon"
                onClick={() => setShowClearAlert(true)}
                disabled={
                  webhookStatus === 'loading' || webhookStatus === 'testing'
                }
                className="transition-opacity"
                type="button"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </form>
      </Form>

      <DiscordClearAlert
        open={showClearAlert}
        onOpenChange={setShowClearAlert}
        onConfirm={handleClearWebhook}
        title="Clear Discord Webhook?"
        description="This will remove the Discord webhook URL from your configuration."
      />
    </div>
  )
}

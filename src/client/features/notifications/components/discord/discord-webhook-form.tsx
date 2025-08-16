import { zodResolver } from '@hookform/resolvers/zod'
import { Check, InfoIcon, Loader2, Save, Trash2, X } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { MultiInput } from '@/components/ui/multi-input'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DiscordClearAlert } from '@/features/notifications/components/discord/discord-clear-alert'
import {
  type WebhookFormSchema,
  webhookFormSchema,
} from '@/features/notifications/schemas/form-schemas'
import { useConfigStore } from '@/stores/configStore'

interface DiscordWebhookFormProps {
  isInitialized: boolean
}

/****
 * Displays a form for entering, validating, testing, saving, and clearing Discord webhook URLs in the application configuration.
 *
 * Users can input up to five Discord webhook URLs, test their validity, save them after a successful test, or clear all saved webhooks with confirmation. The form enforces validation and requires a successful connection test before saving, providing user feedback and disabling controls during loading or testing states.
 *
 * @param isInitialized - Whether the configuration is ready for editing.
 */
export function DiscordWebhookForm({ isInitialized }: DiscordWebhookFormProps) {
  const config = useConfigStore((state) => state.config)
  const updateConfig = useConfigStore((state) => state.updateConfig)
  const [webhookStatus, setWebhookStatus] = React.useState<
    'idle' | 'loading' | 'testing' | 'success' | 'error'
  >('idle')
  const [webhookTestValid, setWebhookTestValid] = React.useState(false)
  const [_webhookTested, setWebhookTested] = React.useState(false)
  const [showClearAlert, setShowClearAlert] = React.useState(false)

  const webhookForm = useForm({
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
        let message = 'Error validating webhooks'
        try {
          const errorData = await response.json()
          message = errorData?.message ?? message
        } catch (_) {
          // Ignore JSON parse failures and use default message
        }
        return {
          valid: false,
          error: message,
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
        webhooks: result.urls.map((url: { url: string }) => {
          try {
            const parts = new URL(url.url).pathname.split('/').filter(Boolean)
            if (parts.length < 2) {
              throw new Error('Unexpected webhook format')
            }
            // We've already checked that parts.length >= 2, so these values will exist
            return {
              url: url.url, // Preserve original URL for deduplication
              id: parts.at(-2) ?? '',
              token: parts.at(-1) ?? '',
            }
          } catch {
            return { url: url.url, id: undefined, token: undefined }
          }
        }),
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
      toast.error('Please enter webhook URLs to test')
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

        // Update form with deduplicated URLs if duplicates were removed
        if (result.duplicateCount && result.duplicateCount > 0) {
          const deduplicatedUrls = result.webhooks
            .map((url: { url: string }) => url.url)
            .join(',')
          webhookForm.setValue('discordWebhookUrl', deduplicatedUrls, {
            shouldValidate: true,
            shouldDirty: false,
          })
        }

        if (result.duplicateCount && result.duplicateCount > 0) {
          toast.error(countText)
        } else {
          toast.success(countText)
        }
      } else {
        setWebhookTestValid(false)
        webhookForm.setValue('_connectionTested', false, {
          shouldValidate: true,
        })
        webhookForm.setError('discordWebhookUrl', {
          type: 'manual',
          message: 'Please test connection before saving',
        })
        toast.error(`Webhook validation failed: ${result.error}`)
      }
    } catch (error) {
      console.error('Webhook test error:', error)
      setWebhookTestValid(false)
      webhookForm.setValue('_connectionTested', false, { shouldValidate: true })
      webhookForm.setError('discordWebhookUrl', {
        type: 'manual',
        message: 'Please test connection before saving',
      })
      toast.error('Failed to validate webhook URLs')
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
      toast.success('Discord webhook URL has been updated')

      setTimeout(() => {
        setWebhookStatus('idle')
      }, 1000)
    } catch (error) {
      console.error('Discord webhook update error:', error)
      setWebhookStatus('error')
      toast.error('Failed to update Discord webhook')

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

      toast.success('Discord webhook URL has been cleared')

      setTimeout(() => {
        setWebhookStatus('idle')
      }, 1000)
    } catch (error) {
      console.error('Discord webhook clear error:', error)
      setWebhookStatus('error')
      toast.error('Failed to clear Discord webhook')

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
        <h3 className="text-xl font-semibold text-foreground">
          Discord Webhook
        </h3>
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
                  <FormLabel className="text-foreground">
                    System Discord Webhook URL(s)
                  </FormLabel>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="h-4 w-4 text-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Discord webhook URLs for sending system notifications.
                        Use the + button to add multiple channels.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <FormControl>
                  <div className="flex gap-2">
                    <MultiInput
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Enter Discord Webhook URL"
                      disabled={
                        webhookStatus === 'loading' ||
                        webhookStatus === 'testing'
                      }
                      validateValue={(url) => {
                        // Basic Discord webhook URL validation
                        return (
                          url === '' ||
                          url.includes('discord.com/api/webhooks/') ||
                          url.includes('discordapp.com/api/webhooks/')
                        )
                      }}
                      maxFields={5}
                      className="flex-1"
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
        title="Clear Discord Webhooks?"
        description="This will remove all Discord webhook URLs from your configuration."
      />
    </div>
  )
}

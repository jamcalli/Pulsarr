import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Save, X, InfoIcon, Trash2 } from 'lucide-react'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { useConfigStore } from '@/stores/configStore'
import { DiscordStatusBadge } from '@/components/ui/discord-bot-status-badge'
import {
  discordBotFormSchema,
  type DiscordBotFormSchema,
} from '@/features/notifications/schemas/form-schemas'
import { DiscordClearAlert } from '@/features/notifications/components/discord/discord-clear-alert'

interface DiscordBotFormProps {
  isInitialized: boolean
}

/****
 * Renders a form for configuring Discord bot integration settings, including bot token, client ID, and guild ID.
 *
 * The form provides schema-based validation, contextual tooltips, and real-time feedback on submission or clearing of settings. User actions update a global configuration store and trigger toast notifications for success or error states.
 *
 * @param isInitialized - Indicates whether the form is ready for user interaction.
 */
export function DiscordBotForm({ isInitialized }: DiscordBotFormProps) {
  const config = useConfigStore((state) => state.config)
  const updateConfig = useConfigStore((state) => state.updateConfig)
  const [discordBotStatus, setDiscordBotStatus] = React.useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [showClearAlert, setShowClearAlert] = React.useState(false)
  const [formTouched, setFormTouched] = React.useState(false)

  const discordBotForm = useForm<DiscordBotFormSchema>({
    resolver: zodResolver(discordBotFormSchema),
    defaultValues: {
      discordBotToken: '',
      discordClientId: '',
      discordGuildId: '',
    },
    mode: 'onChange',
  })

  React.useEffect(() => {
    if (config) {
      discordBotForm.setValue('discordBotToken', config.discordBotToken || '')
      discordBotForm.setValue('discordClientId', config.discordClientId || '')
      discordBotForm.setValue('discordGuildId', config.discordGuildId || '')
      discordBotForm.reset({
        discordBotToken: config.discordBotToken || '',
        discordClientId: config.discordClientId || '',
        discordGuildId: config.discordGuildId || '',
      })
    }
  }, [config, discordBotForm])

  React.useEffect(() => {
    const subscription = discordBotForm.watch(() => {
      if (formTouched) {
        discordBotForm.trigger()
      }
    })

    return () => subscription.unsubscribe()
  }, [discordBotForm, formTouched])

  const handleFieldChange = () => {
    if (!formTouched) {
      setFormTouched(true)
      discordBotForm.trigger()
    }
  }

  const resetForm = () => {
    if (config) {
      discordBotForm.reset({
        discordBotToken: config.discordBotToken || '',
        discordClientId: config.discordClientId || '',
        discordGuildId: config.discordGuildId || '',
      })
      setFormTouched(false)
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

      setDiscordBotStatus('success')
      // Reset form's dirty state
      discordBotForm.reset(data)
      setFormTouched(false)
      toast.success('Discord bot settings have been updated')

      setTimeout(() => {
        setDiscordBotStatus('idle')
      }, 1000)
    } catch (error) {
      console.error('Discord bot settings update error:', error)
      setDiscordBotStatus('error')
      toast.error('Failed to update Discord bot settings')

      await new Promise((resolve) => setTimeout(resolve, 1000))
      setDiscordBotStatus('idle')
    }
  }

  const handleClearDiscordBot = async () => {
    setDiscordBotStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

      await Promise.all([
        updateConfig({
          discordBotToken: '',
          discordClientId: '',
          discordGuildId: '',
        }),
        minimumLoadingTime,
      ])

      setDiscordBotStatus('success')
      discordBotForm.reset({
        discordBotToken: '',
        discordClientId: '',
        discordGuildId: '',
      })
      setFormTouched(false)

      toast.success('Discord bot settings have been cleared')

      setTimeout(() => {
        setDiscordBotStatus('idle')
      }, 1000)
    } catch (error) {
      console.error('Discord bot settings clear error:', error)
      setDiscordBotStatus('error')
      toast.error('Failed to clear Discord bot settings')

      await new Promise((resolve) => setTimeout(resolve, 1000))
      setDiscordBotStatus('idle')
    }
  }

  const isDirty = discordBotForm.formState.isDirty
  const isValid = discordBotForm.formState.isValid

  const hasBotSettings = !!(
    discordBotForm.watch('discordBotToken') ||
    discordBotForm.watch('discordClientId') ||
    discordBotForm.watch('discordGuildId')
  )

  return (
    <div className="grid gap-4 mt-6">
      <div className="flex items-center">
        <h3 className="text-xl font-semibold text-foreground">
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
                <div className="flex items-center gap-1">
                  <FormLabel className="text-foreground">
                    Discord Bot Token
                  </FormLabel>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="h-4 w-4 text-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Bot token from Discord Developer Portal.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="Enter Discord Bot Token"
                    type="password"
                    disabled={discordBotStatus === 'loading'}
                    className="w-full"
                    onChange={(e) => {
                      field.onChange(e)
                      handleFieldChange()
                    }}
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
                  <div className="flex items-center gap-1">
                    <FormLabel className="text-foreground">
                      Discord Client ID
                    </FormLabel>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <InfoIcon className="h-4 w-4 text-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          Client ID from your Discord application's General
                          Information page.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Enter Discord Client ID"
                      type="text"
                      disabled={discordBotStatus === 'loading'}
                      className="w-full"
                      onChange={(e) => {
                        field.onChange(e)
                        handleFieldChange()
                      }}
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
                  <div className="flex items-center gap-1">
                    <FormLabel className="text-foreground">
                      Discord Guild ID
                    </FormLabel>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <InfoIcon className="h-4 w-4 text-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          Server ID found by enabling Developer Mode and
                          right-clicking your server.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Enter Discord Guild ID"
                      type="text"
                      disabled={discordBotStatus === 'loading'}
                      className="w-full"
                      onChange={(e) => {
                        field.onChange(e)
                        handleFieldChange()
                      }}
                    />
                  </FormControl>
                  <FormMessage className="text-xs mt-1" />
                </FormItem>
              )}
            />
          </div>

          <div className="flex justify-end gap-2 mt-4">
            {isDirty && (
              <Button
                type="button"
                variant="cancel"
                onClick={resetForm}
                disabled={discordBotStatus === 'loading'}
                className="flex items-center gap-1"
              >
                <X className="h-4 w-4" />
                <span>Cancel</span>
              </Button>
            )}

            <Button
              type="submit"
              disabled={
                discordBotStatus === 'loading' ||
                !isDirty ||
                !isValid ||
                !isInitialized
              }
              className="flex items-center gap-2"
              variant="blue"
            >
              {discordBotStatus === 'loading' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : discordBotStatus === 'success' ? (
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

            {hasBotSettings && (
              <Button
                variant="error"
                size="icon"
                onClick={() => setShowClearAlert(true)}
                disabled={discordBotStatus === 'loading'}
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
        onConfirm={handleClearDiscordBot}
        title="Clear Discord Bot Settings?"
        description="This will remove all Discord bot configuration values."
      />
    </div>
  )
}

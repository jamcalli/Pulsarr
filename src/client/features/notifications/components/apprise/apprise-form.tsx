import { zodResolver } from '@hookform/resolvers/zod'
import { ExternalLink, InfoIcon, Loader2, Save, Trash2, X } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { AppriseStatusBadge } from '@/components/ui/apprise-status-badge'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { MultiInput } from '@/components/ui/multi-input'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DiscordClearAlert } from '@/features/notifications/components/discord/discord-clear-alert'
import { useConfigStore } from '@/stores/configStore'

interface AppriseFormProps {
  isInitialized: boolean
}

const appriseFormSchema = z.object({
  systemAppriseUrl: z.string().optional(),
})

type AppriseFormSchema = z.infer<typeof appriseFormSchema>

/****
 * Displays a form for configuring system-wide Apprise notification service URLs.
 *
 * Users can view the current Apprise server URL, add or update up to five system notification URLs, and clear them with confirmation. The form provides validation, status feedback, and disables controls when Apprise is not enabled or configuration is not initialized.
 *
 * @param isInitialized - Indicates whether the configuration is ready for editing.
 */
export function AppriseForm({ isInitialized }: AppriseFormProps) {
  const config = useConfigStore((state) => state.config)
  const updateConfig = useConfigStore((state) => state.updateConfig)
  const [appriseStatus, setAppriseStatus] = React.useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [showClearAlert, setShowClearAlert] = React.useState(false)

  const appriseForm = useForm<AppriseFormSchema>({
    resolver: zodResolver(appriseFormSchema),
    defaultValues: {
      systemAppriseUrl: '',
    },
    mode: 'onChange',
  })

  React.useEffect(() => {
    if (config) {
      appriseForm.setValue('systemAppriseUrl', config.systemAppriseUrl || '')
      appriseForm.reset({
        systemAppriseUrl: config.systemAppriseUrl || '',
      })
    }
  }, [config, appriseForm])

  const resetForm = () => {
    if (config) {
      appriseForm.reset({
        systemAppriseUrl: config.systemAppriseUrl || '',
      })
    }
  }

  const onSubmit = async (data: AppriseFormSchema) => {
    setAppriseStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

      await Promise.all([
        updateConfig({
          systemAppriseUrl: data.systemAppriseUrl,
        }),
        minimumLoadingTime,
      ])

      setAppriseStatus('success')
      // Reset form's dirty state
      appriseForm.reset(data)
      toast.success('Apprise system URL has been updated')

      setTimeout(() => {
        setAppriseStatus('idle')
      }, 1000)
    } catch (error) {
      console.error('Apprise settings update error:', error)
      setAppriseStatus('error')
      toast.error('Failed to update Apprise settings')

      await new Promise((resolve) => setTimeout(resolve, 1000))
      setAppriseStatus('idle')
    }
  }

  const handleClearSystemUrl = async () => {
    setAppriseStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

      await Promise.all([
        updateConfig({
          systemAppriseUrl: '',
        }),
        minimumLoadingTime,
      ])

      setAppriseStatus('success')
      appriseForm.reset({
        systemAppriseUrl: '',
      })

      toast.success('System Apprise URL has been cleared')

      setTimeout(() => {
        setAppriseStatus('idle')
      }, 1000)
    } catch (error) {
      console.error('System Apprise URL clear error:', error)
      setAppriseStatus('error')
      toast.error('Failed to clear System Apprise URL')

      await new Promise((resolve) => setTimeout(resolve, 1000))
      setAppriseStatus('idle')
    }
  }

  const isDirty = appriseForm.formState.isDirty
  const isValid = appriseForm.formState.isValid
  const hasSystemAppriseUrl = !!appriseForm.watch('systemAppriseUrl')
  const isAppriseEnabled = config?.enableApprise || false

  return (
    <div className="grid gap-4">
      <div className="flex items-center">
        <h3 className="text-xl font-semibold text-foreground">
          Apprise Notification Service
        </h3>
        <AppriseStatusBadge />
      </div>

      <div className="text-sm text-foreground p-3 bg-secondary-background rounded-base border-2 border-border">
        <p>
          Apprise is a notification service that can send alerts to multiple
          platforms. The service status is determined at server startup and
          cannot be changed at runtime.{' '}
          <a
            href="https://jamcalli.github.io/Pulsarr/docs/notifications/apprise"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-500 inline-flex items-center gap-1"
          >
            Click here <ExternalLink className="h-3 w-3" />
          </a>{' '}
          for setup instructions.
        </p>
      </div>

      <div className="mt-2">
        <div className="flex items-center gap-1">
          <div className="text-sm font-semibold text-foreground">
            Apprise Server URL
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon className="h-4 w-4 text-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Set via environment variables or .env file. Cannot be changed
                through the UI.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="mt-1">
          <Input
            value={config?.appriseUrl || ''}
            disabled={true}
            className="bg-secondary-background opacity-80 text-foreground"
          />
        </div>
      </div>

      <Form {...appriseForm}>
        <form
          onSubmit={appriseForm.handleSubmit(onSubmit)}
          className="space-y-4 mt-4"
        >
          <FormField
            control={appriseForm.control}
            name="systemAppriseUrl"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center gap-1">
                  <FormLabel className="text-foreground">
                    System Apprise URL
                  </FormLabel>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="h-4 w-4 text-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        URLs for system-wide notifications. Use the + button to
                        add multiple services.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <FormControl>
                  <MultiInput
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Enter System Apprise URL"
                    disabled={appriseStatus === 'loading' || !isAppriseEnabled}
                    maxFields={5}
                    className="w-full"
                  />
                </FormControl>
                <FormDescription className="text-xs mt-1">
                  Examples: discord://webhook_id/token,
                  telegram://bottoken/ChatID,
                  slack://TokenA/TokenB/TokenC/Channel
                </FormDescription>
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
                disabled={appriseStatus === 'loading' || !isAppriseEnabled}
                className="flex items-center gap-1"
              >
                <X className="h-4 w-4" />
                <span>Cancel</span>
              </Button>
            )}

            <Button
              type="submit"
              disabled={
                appriseStatus === 'loading' ||
                !isDirty ||
                !isValid ||
                !isInitialized
              }
              className="flex items-center gap-2"
              variant="blue"
            >
              {appriseStatus === 'loading' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : appriseStatus === 'success' ? (
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

            {hasSystemAppriseUrl && (
              <Button
                variant="error"
                size="icon"
                onClick={() => setShowClearAlert(true)}
                disabled={appriseStatus === 'loading' || !isAppriseEnabled}
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
        onConfirm={handleClearSystemUrl}
        title="Clear System Apprise URL?"
        description="This will remove the System Apprise URL from your configuration."
      />
    </div>
  )
}

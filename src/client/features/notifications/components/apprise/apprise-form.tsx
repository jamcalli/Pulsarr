import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Save, X, InfoIcon, Trash2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { useConfigStore } from '@/stores/configStore'
import { AppriseStatusBadge } from '@/components/ui/apprise-status-badge'
import { z } from 'zod'
import { DiscordClearAlert } from '@/features/notifications/components/discord/discord-clear-alert'

interface AppriseFormProps {
  isInitialized: boolean
}

const appriseFormSchema = z.object({
  systemAppriseUrl: z.string().optional(),
})

type AppriseFormSchema = z.infer<typeof appriseFormSchema>

export function AppriseForm({ isInitialized }: AppriseFormProps) {
  const { toast } = useToast()
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
      toast({
        description: 'Apprise system URL has been updated',
        variant: 'default',
      })

      setTimeout(() => {
        setAppriseStatus('idle')
      }, 1000)
    } catch (error) {
      console.error('Apprise settings update error:', error)
      setAppriseStatus('error')
      toast({
        description: 'Failed to update Apprise settings',
        variant: 'destructive',
      })

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

      toast({
        description: 'System Apprise URL has been cleared',
        variant: 'default',
      })

      setTimeout(() => {
        setAppriseStatus('idle')
      }, 1000)
    } catch (error) {
      console.error('System Apprise URL clear error:', error)
      setAppriseStatus('error')
      toast({
        description: 'Failed to clear System Apprise URL',
        variant: 'destructive',
      })

      await new Promise((resolve) => setTimeout(resolve, 1000))
      setAppriseStatus('idle')
    }
  }

  const isDirty = appriseForm.formState.isDirty
  const isValid = appriseForm.formState.isValid
  const hasSystemAppriseUrl = !!appriseForm.watch('systemAppriseUrl')

  return (
    <div className="grid gap-4">
      <div className="flex items-center">
        <h3 className="text-xl font-semibold text-text">
          Apprise Notification Service
        </h3>
        <AppriseStatusBadge />
      </div>

      <div className="text-sm text-text p-3 bg-bw rounded-base border-2 border-border">
        <p>
          Apprise is a notification service that can send alerts to multiple
          platforms. The service status is determined at server startup and
          cannot be changed at runtime.{' '}
          <a
            href="https://github.com/jamcalli/Pulsarr#apprise-notifications"
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
          <div className="text-sm font-semibold text-text">
            Apprise Server URL
          </div>
          <HoverCard>
            <HoverCardTrigger asChild>
              <InfoIcon className="h-4 w-4 text-text cursor-help" />
            </HoverCardTrigger>
            <HoverCardContent className="w-80">
              <p>
                This value is set via environment variables or .env file and
                cannot be changed through the UI. The Apprise service status is
                determined at server startup.
              </p>
            </HoverCardContent>
          </HoverCard>
        </div>
        <div className="mt-1">
          <Input
            value={config?.appriseUrl || ''}
            disabled={true}
            className="bg-bw opacity-80 text-text"
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
                  <FormLabel className="text-text">
                    System Apprise URL
                  </FormLabel>
                  <HoverCard>
                    <HoverCardTrigger asChild>
                      <InfoIcon className="h-4 w-4 text-text cursor-help" />
                    </HoverCardTrigger>
                    <HoverCardContent className="w-80">
                      <p>
                        URL for system-wide notifications (like delete sync
                        operations). This can be any valid Apprise notification
                        URL format, or multiple separated by commas.
                      </p>
                    </HoverCardContent>
                  </HoverCard>
                </div>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="Enter System Apprise URL"
                    type="text"
                    disabled={appriseStatus === 'loading'}
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
                disabled={appriseStatus === 'loading'}
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
                disabled={appriseStatus === 'loading'}
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

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Loader2,
  Save,
  X,
  InfoIcon,
  Trash2,
  Check,
  ExternalLink,
} from 'lucide-react'
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { useConfigStore } from '@/stores/configStore'
import { z } from 'zod'
import { ClearSettingsAlert } from '@/components/ui/clear-settings-alert'

interface TautulliFormProps {
  isInitialized: boolean
}

const tautulliFormSchema = z
  .object({
    tautulliEnabled: z.boolean(),
    tautulliUrl: z.string().optional(),
    tautulliApiKey: z.string().optional(),
    _connectionTested: z.boolean().optional(),
    _originalTautulliUrl: z.string().optional(),
    _originalTautulliApiKey: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // If Tautulli is enabled, both URL and API key are required
    if (data.tautulliEnabled) {
      if (!data.tautulliUrl || data.tautulliUrl.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'URL is required when Tautulli is enabled',
          path: ['tautulliUrl'],
        })
      }

      if (!data.tautulliApiKey || data.tautulliApiKey.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'API key is required when Tautulli is enabled',
          path: ['tautulliApiKey'],
        })
      }

      // If both fields are provided, check if connection has been tested
      if (data.tautulliUrl && data.tautulliApiKey) {
        const hasChangedApiSettings =
          (data._originalTautulliUrl !== undefined &&
            data._originalTautulliUrl !== data.tautulliUrl) ||
          (data._originalTautulliApiKey !== undefined &&
            data._originalTautulliApiKey !== data.tautulliApiKey)

        if (
          !data._connectionTested &&
          ((data._originalTautulliUrl === undefined &&
            data._originalTautulliApiKey === undefined) ||
            hasChangedApiSettings)
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Please test connection before saving',
            path: ['tautulliApiKey'],
          })
        }
      }
    }
  })

type TautulliFormSchema = z.infer<typeof tautulliFormSchema>

// API function to test Tautulli connection
async function testTautulliConnection(url: string, apiKey: string) {
  const response = await fetch('/v1/tautulli/test-connection', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tautulliUrl: url,
      tautulliApiKey: apiKey,
    }),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return response.json()
}

/****
 * Displays a form for configuring Tautulli notification integration.
 *
 * Users can enable/disable Tautulli integration, configure URL and API key,
 * test the connection, and save settings. The form follows the same design
 * pattern as other notification services with consistent layout and actions.
 *
 * @param isInitialized - Whether the configuration is ready for editing.
 */
export function TautulliForm({ isInitialized }: TautulliFormProps) {
  const { toast } = useToast()
  const config = useConfigStore((state) => state.config)
  const updateConfig = useConfigStore((state) => state.updateConfig)
  const [tautulliStatus, setTautulliStatus] = React.useState<
    'idle' | 'loading' | 'testing' | 'success' | 'error'
  >('idle')
  const [tautulliTestValid, setTautulliTestValid] = React.useState(false)
  const [showClearAlert, setShowClearAlert] = React.useState(false)

  const tautulliForm = useForm<TautulliFormSchema>({
    resolver: zodResolver(tautulliFormSchema),
    defaultValues: {
      tautulliEnabled: false,
      tautulliUrl: '',
      tautulliApiKey: '',
      _connectionTested: false,
      _originalTautulliUrl: '',
      _originalTautulliApiKey: '',
    },
    mode: 'onChange',
  })

  React.useEffect(() => {
    if (config) {
      const hasExistingConfig = !!(config.tautulliUrl && config.tautulliApiKey)
      tautulliForm.reset({
        tautulliEnabled: config.tautulliEnabled || false,
        tautulliUrl: config.tautulliUrl || '',
        tautulliApiKey: config.tautulliApiKey || '',
        _connectionTested: hasExistingConfig,
        _originalTautulliUrl: config.tautulliUrl || '',
        _originalTautulliApiKey: config.tautulliApiKey || '',
      })
      if (hasExistingConfig) {
        setTautulliTestValid(true)
      }
    }
  }, [config, tautulliForm])

  React.useEffect(() => {
    const subscription = tautulliForm.watch((formValues, { name }) => {
      if (tautulliForm.formState.isDirty) {
        tautulliForm.trigger()
      }

      // When enabling Tautulli, trigger validation to check required fields
      if (name === 'tautulliEnabled' && formValues.tautulliEnabled) {
        tautulliForm.trigger(['tautulliUrl', 'tautulliApiKey'])
      }
    })

    return () => subscription.unsubscribe()
  }, [tautulliForm])

  React.useEffect(() => {
    const subscription = tautulliForm.watch((formValues, { name }) => {
      if (name === 'tautulliUrl' || name === 'tautulliApiKey') {
        const origUrl = tautulliForm.getValues('_originalTautulliUrl')
        const origKey = tautulliForm.getValues('_originalTautulliApiKey')

        if (
          (name === 'tautulliUrl' && formValues.tautulliUrl !== origUrl) ||
          (name === 'tautulliApiKey' && formValues.tautulliApiKey !== origKey)
        ) {
          tautulliForm.setValue('_connectionTested', false)
          setTautulliTestValid(false)
        } else if (
          formValues.tautulliUrl === origUrl &&
          formValues.tautulliApiKey === origKey &&
          origUrl &&
          origKey
        ) {
          tautulliForm.setValue('_connectionTested', true)
          setTautulliTestValid(true)
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [tautulliForm])

  const resetForm = () => {
    if (config) {
      const hasExistingConfig = !!(config.tautulliUrl && config.tautulliApiKey)
      tautulliForm.reset({
        tautulliEnabled: config.tautulliEnabled || false,
        tautulliUrl: config.tautulliUrl || '',
        tautulliApiKey: config.tautulliApiKey || '',
        _connectionTested: hasExistingConfig,
        _originalTautulliUrl: config.tautulliUrl || '',
        _originalTautulliApiKey: config.tautulliApiKey || '',
      })
      setTautulliTestValid(hasExistingConfig)
    }
  }

  const testConnection = async () => {
    setTautulliStatus('testing')
    setTautulliTestValid(false)

    const url = tautulliForm.getValues('tautulliUrl')
    const apiKey = tautulliForm.getValues('tautulliApiKey')

    if (!url || !apiKey) {
      tautulliForm.setError('tautulliUrl', {
        type: 'manual',
        message: 'URL and API key are required for testing',
      })
      setTautulliStatus('idle')
      return
    }

    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

      const [result] = await Promise.all([
        testTautulliConnection(url, apiKey),
        minimumLoadingTime,
      ])

      if (result.success) {
        setTautulliTestValid(true)
        tautulliForm.setValue('_connectionTested', true, {
          shouldValidate: true,
        })
        tautulliForm.clearErrors(['tautulliUrl', 'tautulliApiKey'])

        toast({
          description: 'Tautulli connection is valid!',
          variant: 'default',
        })
      } else {
        setTautulliTestValid(false)
        tautulliForm.setValue('_connectionTested', false, {
          shouldValidate: true,
        })
        // Schema validation will handle the error
        toast({
          description: `Connection test failed: ${result.message || 'Unknown error'}`,
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('Tautulli test error:', error)
      setTautulliTestValid(false)
      tautulliForm.setValue('_connectionTested', false, {
        shouldValidate: true,
      })
      // Schema validation will handle the error
      toast({
        description: 'Failed to test Tautulli connection',
        variant: 'destructive',
      })
    } finally {
      setTautulliStatus('idle')
    }
  }

  const onSubmit = async (data: TautulliFormSchema) => {
    // Form validation via schema should handle test requirement

    setTautulliStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

      await Promise.all([
        updateConfig({
          tautulliEnabled: data.tautulliEnabled,
          tautulliUrl: data.tautulliUrl || '',
          tautulliApiKey: data.tautulliApiKey || '',
        }),
        minimumLoadingTime,
      ])

      setTautulliStatus('success')
      // Reset form with updated original values
      tautulliForm.reset({
        ...data,
        _originalTautulliUrl: data.tautulliUrl || '',
        _originalTautulliApiKey: data.tautulliApiKey || '',
      })
      toast({
        description: 'Tautulli settings have been updated',
        variant: 'default',
      })

      setTimeout(() => {
        setTautulliStatus('idle')
      }, 1000)
    } catch (error) {
      console.error('Tautulli settings update error:', error)
      setTautulliStatus('error')
      toast({
        description: 'Failed to update Tautulli settings',
        variant: 'destructive',
      })

      await new Promise((resolve) => setTimeout(resolve, 1000))
      setTautulliStatus('idle')
    }
  }

  const handleClearSettings = async () => {
    setTautulliStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

      await Promise.all([
        updateConfig({
          tautulliEnabled: false,
          tautulliUrl: '',
          tautulliApiKey: '',
        }),
        minimumLoadingTime,
      ])

      setTautulliStatus('success')
      tautulliForm.reset({
        tautulliEnabled: false,
        tautulliUrl: '',
        tautulliApiKey: '',
        _connectionTested: false,
        _originalTautulliUrl: '',
        _originalTautulliApiKey: '',
      })
      setTautulliTestValid(false)

      toast({
        description: 'Tautulli settings have been cleared',
        variant: 'default',
      })

      setTimeout(() => {
        setTautulliStatus('idle')
      }, 1000)
    } catch (error) {
      console.error('Tautulli settings clear error:', error)
      setTautulliStatus('error')
      toast({
        description: 'Failed to clear Tautulli settings',
        variant: 'destructive',
      })

      await new Promise((resolve) => setTimeout(resolve, 1000))
      setTautulliStatus('idle')
    }
  }

  const isDirty = tautulliForm.formState.isDirty
  const isValid = tautulliForm.formState.isValid
  const isEnabled = tautulliForm.watch('tautulliEnabled')
  const tautulliUrl = tautulliForm.watch('tautulliUrl')
  const tautulliApiKey = tautulliForm.watch('tautulliApiKey')
  const hasCredentials = !!(tautulliUrl && tautulliApiKey)
  // Check if we're showing the connection test error
  const apiKeyFieldState = tautulliForm.getFieldState('tautulliApiKey')
  const hasConnectionTestError =
    apiKeyFieldState.error?.message?.includes('test connection') || false

  // Check if connection needs to be tested
  const connectionTested = tautulliForm.watch('_connectionTested')
  const needsConnectionTest =
    isEnabled && hasCredentials && connectionTested === false
  const hasSettings = !!(isEnabled || tautulliUrl || tautulliApiKey)

  return (
    <div className="grid gap-4">
      <div className="flex items-center">
        <h3 className="text-xl font-semibold text-text">
          Tautulli Notification Service
        </h3>
      </div>

      <div className="text-sm text-text p-3 bg-bw rounded-base border-2 border-border">
        <p>
          Tautulli integration sends native Plex notifications using your
          existing notification agents. This provides a seamless notification
          experience within the Plex ecosystem.{' '}
          <a
            href="https://jamcalli.github.io/Pulsarr/docs/notifications/tautulli"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-500 inline-flex items-center gap-1"
          >
            Click here <ExternalLink className="h-3 w-3" />
          </a>{' '}
          for setup instructions.
        </p>
      </div>

      <Form {...tautulliForm}>
        <form
          onSubmit={tautulliForm.handleSubmit(onSubmit)}
          className="space-y-4"
        >
          <FormField
            control={tautulliForm.control}
            name="tautulliEnabled"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <FormLabel className="text-text">
                      Tautulli Notifications Enabled
                    </FormLabel>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <InfoIcon className="h-4 w-4 text-text cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          Enable Tautulli integration for native Plex
                          notifications
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={tautulliStatus === 'loading'}
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {isEnabled && (
            <>
              <FormField
                control={tautulliForm.control}
                name="tautulliUrl"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-1">
                      <FormLabel className="text-text">Tautulli URL</FormLabel>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <InfoIcon className="h-4 w-4 text-text cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            Full URL to your Tautulli instance (including
                            http/https)
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="http://localhost:8181"
                        type="text"
                        disabled={
                          tautulliStatus === 'loading' ||
                          tautulliStatus === 'testing'
                        }
                        className="w-full"
                      />
                    </FormControl>
                    <FormDescription className="text-xs mt-1">
                      Example: http://192.168.1.100:8181 or
                      https://tautulli.mydomain.com
                    </FormDescription>
                    <FormMessage className="text-xs mt-1" />
                  </FormItem>
                )}
              />

              <FormField
                control={tautulliForm.control}
                name="tautulliApiKey"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-1">
                      <FormLabel className="text-text">
                        Tautulli API Key
                      </FormLabel>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <InfoIcon className="h-4 w-4 text-text cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            API key from Tautulli Settings → Web Interface
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <FormControl>
                      <div className="flex gap-2">
                        <Input
                          {...field}
                          placeholder="Your Tautulli API key"
                          type="password"
                          disabled={
                            tautulliStatus === 'loading' ||
                            tautulliStatus === 'testing'
                          }
                          className="w-full"
                        />
                        <TooltipProvider>
                          <Tooltip
                            {...(hasConnectionTestError || needsConnectionTest
                              ? { open: true }
                              : {})}
                          >
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                onClick={testConnection}
                                disabled={
                                  tautulliStatus === 'loading' ||
                                  tautulliStatus === 'testing' ||
                                  !hasCredentials
                                }
                                size="icon"
                                variant="noShadow"
                                className="shrink-0"
                              >
                                {tautulliStatus === 'testing' ? (
                                  <Loader2 className="animate-spin" />
                                ) : tautulliTestValid ? (
                                  <Check className="text-black" />
                                ) : (
                                  <Check />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent
                              className={
                                hasConnectionTestError || needsConnectionTest
                                  ? 'bg-error text-black'
                                  : ''
                              }
                            >
                              <p>
                                {hasConnectionTestError || needsConnectionTest
                                  ? 'Test connection required'
                                  : 'Test connection'}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </FormControl>
                    <FormDescription className="text-xs mt-1">
                      Found in Tautulli Settings → Web Interface → API Key
                    </FormDescription>
                    <FormMessage className="text-xs mt-1" />
                  </FormItem>
                )}
              />
            </>
          )}

          <div className="flex justify-end gap-2 mt-4">
            {isDirty && (
              <Button
                type="button"
                variant="cancel"
                onClick={resetForm}
                disabled={
                  tautulliStatus === 'loading' || tautulliStatus === 'testing'
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
                tautulliStatus === 'loading' ||
                tautulliStatus === 'testing' ||
                !isDirty ||
                !isValid ||
                !isInitialized
              }
              className="flex items-center gap-2"
              variant="blue"
            >
              {tautulliStatus === 'loading' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : tautulliStatus === 'success' ? (
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

            {hasSettings && (
              <Button
                variant="error"
                size="icon"
                onClick={() => setShowClearAlert(true)}
                disabled={
                  tautulliStatus === 'loading' || tautulliStatus === 'testing'
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

      <ClearSettingsAlert
        open={showClearAlert}
        onOpenChange={setShowClearAlert}
        onConfirm={handleClearSettings}
        title="Clear Tautulli Settings?"
        description="This will disable Tautulli integration and remove all configuration settings."
      />
    </div>
  )
}

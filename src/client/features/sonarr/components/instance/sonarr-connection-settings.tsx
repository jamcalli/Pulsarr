import { useEffect } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
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
import type { SonarrInstanceSchema } from '@/features/sonarr/store/schemas'
import type { ConnectionStatus } from '@/features/sonarr/types/types'
import { useMediaQuery } from '@/hooks/use-media-query'

interface ConnectionSettingsProps {
  form: UseFormReturn<SonarrInstanceSchema>
  testStatus: ConnectionStatus
  onTest: () => Promise<void>
  saveStatus: ConnectionStatus
  hasValidUrlAndKey: boolean
  disabled?: boolean
}

/**
 * Renders a responsive form section for configuring and testing a Sonarr connection.
 *
 * Provides input fields for the Sonarr URL and API key, along with a button to test the connection. Displays validation messages, connection test status, and visual feedback when a test is required or fails. Layout automatically adapts for mobile screens.
 *
 * @param form - Form state and methods for managing Sonarr instance configuration.
 * @param testStatus - Current status of the connection test.
 * @param onTest - Async callback to initiate a connection test.
 * @param hasValidUrlAndKey - Indicates if the URL and API key fields are valid.
 * @param disabled - Optional flag to disable all inputs and actions.
 */
export default function ConnectionSettings({
  form,
  testStatus,
  onTest,
  hasValidUrlAndKey,
  disabled = false,
}: ConnectionSettingsProps) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const isDisabled = disabled || testStatus === 'loading'

  useEffect(() => {
    if (testStatus === 'success') {
      form.setValue('_connectionTested', true, { shouldValidate: true })
    } else if (testStatus === 'idle') {
      form.setValue('_connectionTested', false, { shouldValidate: true })
    }
  }, [testStatus, form])

  // Determine if the connection test error message is showing
  const apiKeyFieldState = form.getFieldState('apiKey')
  const hasConnectionTestError =
    apiKeyFieldState.error?.message?.includes('test connection') || false

  // Check if connection needs to be tested
  const connectionTested = form.watch('_connectionTested')
  const needsConnectionTest = hasValidUrlAndKey && connectionTested === false

  return (
    <div className={`flex ${isMobile ? 'flex-col' : 'flex-row'} gap-4`}>
      <div className="flex-1">
        <FormField
          control={form.control}
          name="baseUrl"
          render={({ field }) => (
            <FormItem className="grow">
              <FormLabel className="text-foreground">Sonarr URL</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="http://localhost:8989"
                  disabled={isDisabled}
                  onChange={(e) => {
                    field.onChange(e)
                    form.clearErrors('baseUrl')
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <div className="flex-1">
        <FormField
          control={form.control}
          name="apiKey"
          render={({ field }) => (
            <FormItem className="grow">
              <FormLabel className="text-foreground">API Key</FormLabel>
              <div className="flex gap-2">
                <div className="grow">
                  <FormControl>
                    <Input
                      {...field}
                      type="password"
                      disabled={isDisabled}
                      onChange={(e) => {
                        field.onChange(e)
                        form.clearErrors('apiKey')
                      }}
                    />
                  </FormControl>
                </div>
                <TooltipProvider>
                  <Tooltip
                    {...(hasConnectionTestError || needsConnectionTest
                      ? { open: true }
                      : {})}
                  >
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="noShadow"
                        onClick={() => {
                          onTest().catch(() => {})
                        }}
                        disabled={isDisabled || !hasValidUrlAndKey}
                        className="mt-0"
                      >
                        {testStatus === 'loading' ? (
                          <Loader2 className="animate-spin" />
                        ) : testStatus === 'success' ? (
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
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  )
}

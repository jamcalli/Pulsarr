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
import type { RadarrInstanceSchema } from '@/features/radarr/store/schemas'
import type { ConnectionStatus } from '@/features/radarr/types/types'
import { useMediaQuery } from '@/hooks/use-media-query'

interface ConnectionSettingsProps {
  form: UseFormReturn<RadarrInstanceSchema>
  testStatus: ConnectionStatus
  onTest: () => Promise<void>
  saveStatus: ConnectionStatus
  hasValidUrlAndKey: boolean
  disabled?: boolean
}

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

  return (
    <div className={`flex ${isMobile ? 'flex-col' : 'flex-row'} gap-4`}>
      <div className="flex-1">
        <FormField
          control={form.control}
          name="baseUrl"
          render={({ field }) => (
            <FormItem className="flex-grow">
              <FormLabel className="text-text">Radarr URL</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="http://localhost:7878"
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
            <FormItem className="flex-grow">
              <FormLabel className="text-text">API Key</FormLabel>
              <div className="flex gap-2">
                <div className="flex-grow">
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
                  <Tooltip open={hasConnectionTestError || undefined}>
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
                        hasConnectionTestError ? 'bg-error text-black' : ''
                      }
                    >
                      <p>
                        {hasConnectionTestError
                          ? 'Test connection'
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

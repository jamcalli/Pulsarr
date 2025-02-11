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
import { Input } from '@/components/ui/input'
import type { SonarrInstanceSchema } from '@/types/sonarr/schemas'
import type { ConnectionStatus } from '@/types/sonarr/types'

interface ConnectionSettingsProps {
  form: UseFormReturn<SonarrInstanceSchema>
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
  const isDisabled = disabled || testStatus === 'loading'

  return (
    <div className="flex portrait:flex-col gap-4">
      <div className="flex-1">
        <FormField
          control={form.control}
          name="baseUrl"
          render={({ field }) => (
            <FormItem className="flex-grow">
              <FormLabel className="text-text">Sonarr URL</FormLabel>
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
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  )
}

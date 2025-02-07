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
import type { SonarrInstanceSchema } from './sonarr-instance-card'

export type ConnectionSettingsStatus = 'idle' | 'loading' | 'success' | 'error'

interface ConnectionSettingsProps {
  form: UseFormReturn<SonarrInstanceSchema>
  testStatus: ConnectionSettingsStatus
  onTest: () => void
  saveStatus: ConnectionSettingsStatus
  hasValidUrlAndKey: boolean
}

export default function ConnectionSettings({
  form,
  testStatus,
  onTest,
  hasValidUrlAndKey,
}: ConnectionSettingsProps) {
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
                  disabled={testStatus === 'loading'}
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
                      disabled={testStatus === 'loading'}
                    />
                  </FormControl>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="noShadow"
                  onClick={onTest}
                  disabled={testStatus === 'loading' || !hasValidUrlAndKey}
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

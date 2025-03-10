import React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Check, Trash2 } from 'lucide-react'
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
import type { ConnectionStatus } from '@/features/plex/store/types'
import { plexTokenSchema, type PlexTokenSchema } from '@/features/plex/store/schemas'

interface PlexConnectionSettingsProps {
  plexToken: string | undefined
  testStatus: ConnectionStatus
  saveStatus: ConnectionStatus
  onTest: (token: string) => Promise<void>
  onSave: (token: string) => Promise<void>
  onRemove: () => Promise<void>
}

export function PlexConnectionSettings({
  plexToken,
  testStatus,
  saveStatus,
  onTest,
  onSave,
  onRemove,
}: PlexConnectionSettingsProps) {
  const form = useForm<PlexTokenSchema>({
    resolver: zodResolver(plexTokenSchema),
    defaultValues: {
      plexToken: plexToken || '',
    },
  })

  React.useEffect(() => {
    if (plexToken) {
      form.reset({ plexToken })
    }
  }, [plexToken, form])

  const handleSubmit = async (data: PlexTokenSchema) => {
    await onSave(data.plexToken)
  }

  const handleTest = async () => {
    const token = form.getValues('plexToken')
    if (!token) return
    await onTest(token)
  }

  const isButtonDisabled = 
    testStatus === 'loading' || 
    testStatus === 'testing' || 
    saveStatus === 'loading'

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="space-y-4"
      >
        <div className="flex items-end space-x-2">
          <FormField
            control={form.control}
            name="plexToken"
            render={({ field }) => (
              <FormItem className="flex-grow">
                <FormLabel className="text-text">
                  Plex Token
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="Enter Plex Token"
                    type="text"
                    disabled={isButtonDisabled}
                    className="w-full"
                  />
                </FormControl>
                <FormMessage className="text-xs mt-1" />
              </FormItem>
            )}
          />
          <div className="flex space-x-2 shrink-0">
            <Button
              type="button"
              variant="noShadow"
              onClick={handleTest}
              disabled={isButtonDisabled || !form.getValues('plexToken')}
              className="shrink-0"
            >
              {testStatus === 'testing' || testStatus === 'loading' ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : testStatus === 'success' ? (
                <Check className="h-4 w-4 mr-1" />
              ) : null}
              Test
            </Button>
            <Button
              type="button"
              size="icon"
              variant="error"
              onClick={onRemove}
              disabled={isButtonDisabled || !form.getValues('plexToken')}
              className="shrink-0"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <Button
          type="submit"
          disabled={
            !form.formState.isDirty ||
            !form.formState.isValid ||
            isButtonDisabled ||
            testStatus !== 'success'
          }
          className="mt-4 flex items-center gap-2"
          variant="blue"
        >
          {saveStatus === 'loading' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="portrait:hidden">Saving...</span>
            </>
          ) : (
            <>
              <span>Save Token</span>
            </>
          )}
        </Button>
      </form>
    </Form>
  )
}
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Save } from 'lucide-react'
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
import { useToast } from '@/hooks/use-toast'
import { useConfigStore } from '@/stores/configStore'
import { DiscordStatusBadge } from '@/components/ui/discord-bot-status-badge'
import {
  discordBotFormSchema,
  type DiscordBotFormSchema,
} from '@/features/notifications/schemas/form-schemas'

interface DiscordBotFormProps {
  isInitialized: boolean
}

export function DiscordBotForm({ isInitialized }: DiscordBotFormProps) {
  const { toast } = useToast()
  const config = useConfigStore((state) => state.config)
  const updateConfig = useConfigStore((state) => state.updateConfig)
  const [discordBotStatus, setDiscordBotStatus] = React.useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')

  const discordBotForm = useForm<DiscordBotFormSchema>({
    resolver: zodResolver(discordBotFormSchema),
    defaultValues: {
      discordBotToken: '',
      discordClientId: '',
      discordGuildId: '',
    },
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

      setDiscordBotStatus('idle')
      // Reset form's dirty state
      discordBotForm.reset(data)
      toast({
        description: 'Discord bot settings have been updated',
        variant: 'default',
      })
    } catch (error) {
      console.error('Discord bot settings update error:', error)
      setDiscordBotStatus('error')
      toast({
        description: 'Failed to update Discord bot settings',
        variant: 'destructive',
      })

      await new Promise((resolve) => setTimeout(resolve, 1000))
      setDiscordBotStatus('idle')
    }
  }

  return (
    <div className="grid gap-4 mt-6">
      <div className="flex items-center">
        <h3 className="text-xl font-semibold text-text">
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
                <FormLabel className="text-text">Discord Bot Token</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="Enter Discord Bot Token"
                    type="password"
                    disabled={discordBotStatus === 'loading'}
                    className="w-full"
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
                  <FormLabel className="text-text">Discord Client ID</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Enter Discord Client ID"
                      type="text"
                      disabled={discordBotStatus === 'loading'}
                      className="w-full"
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
                  <FormLabel className="text-text">Discord Guild ID</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Enter Discord Guild ID"
                      type="text"
                      disabled={discordBotStatus === 'loading'}
                      className="w-full"
                    />
                  </FormControl>
                  <FormMessage className="text-xs mt-1" />
                </FormItem>
              )}
            />
          </div>

          <Button
            type="submit"
            disabled={
              discordBotStatus === 'loading' ||
              !discordBotForm.formState.isDirty ||
              !isInitialized
            }
            className="mt-4 flex items-center gap-2"
            variant="blue"
          >
            {discordBotStatus === 'loading' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="portrait:hidden">Saving...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span className="portrait:hidden">Save Changes</span>
              </>
            )}
          </Button>
        </form>
      </Form>
    </div>
  )
}

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Check, Trash2 } from 'lucide-react'
import WindowedLayout from '@/layouts/window'
import { Button } from '@/components/ui/button'
import { Form, FormField, FormItem, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'

// Create a Zod schema for the form
const plexTokenFormSchema = z.object({
  plexToken: z.string().min(5, { message: 'Plex Token is required' }),
})

type PlexTokenFormSchema = z.infer<typeof plexTokenFormSchema>

export default function PlexConfigPage() {
  const { toast } = useToast()
  const [status, setStatus] = React.useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')

  const form = useForm<PlexTokenFormSchema>({
    resolver: zodResolver(plexTokenFormSchema),
    defaultValues: {
      plexToken: '',
    },
  })

  const onSubmit = async (data: PlexTokenFormSchema) => {
    setStatus('loading')
    try {
      // First, update config with the Plex token
      const configResponse = await fetch('/v1/config/updateconfig', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plexTokens: [data.plexToken],
        }),
      })

      const configResult = await configResponse.json()

      if (!configResponse.ok) {
        setStatus('error')
        toast({
          title: 'Configuration Update Failed',
          description: configResult.message || 'Unable to update Plex token',
          variant: 'destructive',
        })
        return
      }

      // If config update successful, ping Plex
      const plexPingResponse = await fetch('/v1/plex/ping', {
        method: 'GET',
      })

      const plexPingResult = await plexPingResponse.json()

      if (plexPingResult.success) {
        setStatus('success')
        toast({
          title: 'Plex Token Configured',
          description: 'Plex token successfully added and verified',
          variant: 'default',
        })
      } else {
        setStatus('error')
        toast({
          title: 'Plex Verification Failed',
          description: 'Unable to verify Plex connection',
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('Token submission error:', error)
      setStatus('error')
      toast({
        title: 'Connection Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      })
    }
  }

  return (
    <WindowedLayout>
      <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 text-xl leading-[1.7]">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-1">
            <div className="flex items-start space-x-2">
              <FormField
                control={form.control}
                name="plexToken"
                render={({ field }) => (
                  <FormItem className="flex-grow">
                    <Input
                      {...field}
                      placeholder="Enter Plex Token"
                      type="text"
                      disabled={status === 'loading'}
                      className="w-full"
                    />
                    <FormMessage className="text-xs mt-1" />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                size="icon"
                variant="noShadow"
                disabled={status === 'loading' || !form.formState.isValid}
                className="shrink-0"
              >
                {status === 'loading' ? (
                  <Loader2 className="animate-spin" />
                ) : status === 'success' ? (
                  <Check className="text-black" />
                ) : (
                  <Check />
                )}
              </Button>
              <Button
                type="button"
                size="icon"
                variant="noShadow"
                onClick={async () => {
                  setStatus('loading')
                  try {
                    const response = await fetch('/v1/config/updateconfig', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        plexTokens: [],
                      }),
                    })
                    if (response.ok) {
                      form.reset()
                      setStatus('idle')
                      toast({
                        title: 'Token Removed',
                        description: 'Plex token has been removed',
                        variant: 'default',
                      })
                    } else {
                      throw new Error('Failed to remove token')
                    }
                  } catch (error) {
                    setStatus('error')
                    toast({
                      title: 'Error',
                      description: 'Failed to remove token',
                      variant: 'destructive',
                    })
                  }
                }}
                disabled={status === 'loading' || !form.getValues('plexToken')}
                className="shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </WindowedLayout>
  )
}

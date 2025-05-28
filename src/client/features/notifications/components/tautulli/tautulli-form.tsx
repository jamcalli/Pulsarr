import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import { Loader2, Check, AlertCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

const tautulliFormSchema = z.object({
  tautulliEnabled: z.boolean(),
  tautulliUrl: z.string().optional(),
  tautulliApiKey: z.string().optional(),
})

type TautulliFormData = z.infer<typeof tautulliFormSchema>

interface TautulliFormProps {
  isInitialized: boolean
}

export function TautulliForm({ isInitialized }: TautulliFormProps) {
  const [loading, setLoading] = useState(false)
  const [testLoading, setTestLoading] = useState(false)
  const [testSuccess, setTestSuccess] = useState<boolean | null>(null)
  const { toast } = useToast()

  const form = useForm<TautulliFormData>({
    resolver: zodResolver(tautulliFormSchema),
    defaultValues: {
      tautulliEnabled: false,
      tautulliUrl: '',
      tautulliApiKey: '',
    },
  })

  // Load config when component mounts
  React.useEffect(() => {
    if (isInitialized) {
      loadConfig()
    }
  }, [isInitialized])

  const loadConfig = async () => {
    try {
      const response = await fetch('/api/v1/config')
      if (response.ok) {
        const data = await response.json()
        form.reset({
          tautulliEnabled: data.config.tautulliEnabled || false,
          tautulliUrl: data.config.tautulliUrl || '',
          tautulliApiKey: data.config.tautulliApiKey || '',
        })
      }
    } catch (error) {
      console.error('Failed to load config:', error)
    }
  }

  const onSubmit = async (data: TautulliFormData) => {
    setLoading(true)
    try {
      const response = await fetch('/api/v1/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Tautulli configuration saved successfully',
        })
      } else {
        throw new Error('Failed to save configuration')
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save Tautulli configuration',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const testConnection = async () => {
    setTestLoading(true)
    setTestSuccess(null)

    try {
      const response = await fetch('/api/v1/tautulli/test', {
        method: 'POST',
      })

      const result = await response.json()
      setTestSuccess(result.success)

      toast({
        title: result.success ? 'Success' : 'Error',
        description: result.message,
        variant: result.success ? 'default' : 'destructive',
      })
    } catch (error) {
      setTestSuccess(false)
      toast({
        title: 'Error',
        description: 'Failed to test Tautulli connection',
        variant: 'destructive',
      })
    } finally {
      setTestLoading(false)
    }
  }

  const syncNotifiers = async () => {
    try {
      const response = await fetch('/api/v1/tautulli/sync-notifiers', {
        method: 'POST',
      })

      const result = await response.json()

      toast({
        title: result.success ? 'Success' : 'Error',
        description: result.success
          ? `Synced ${result.syncedUsers} user notifiers`
          : result.message || 'Failed to sync notifiers',
        variant: result.success ? 'default' : 'destructive',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to sync user notifiers',
        variant: 'destructive',
      })
    }
  }

  const watchEnabled = form.watch('tautulliEnabled')
  const watchUrl = form.watch('tautulliUrl')
  const watchApiKey = form.watch('tautulliApiKey')
  const hasCredentials = watchUrl && watchApiKey

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tautulli Integration</CardTitle>
        <CardDescription>
          Configure Tautulli integration for native Plex notifications using
          your existing notification agents.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="tautulliEnabled"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Enable Tautulli Integration</FormLabel>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={loading}
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {watchEnabled && (
              <>
                <FormField
                  control={form.control}
                  name="tautulliUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tautulli URL</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="http://localhost:8181"
                          disabled={loading}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tautulliApiKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tautulli API Key</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Your Tautulli API key"
                          disabled={loading}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="neutral"
                    onClick={testConnection}
                    disabled={!hasCredentials || testLoading}
                    size="sm"
                  >
                    {testLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : testSuccess === true ? (
                      <Check className="h-4 w-4 mr-2 text-green-600" />
                    ) : testSuccess === false ? (
                      <AlertCircle className="h-4 w-4 mr-2 text-red-600" />
                    ) : null}
                    Test Connection
                  </Button>

                  <Button
                    type="button"
                    variant="neutral"
                    onClick={syncNotifiers}
                    disabled={!hasCredentials}
                    size="sm"
                  >
                    Sync User Notifiers
                  </Button>
                </div>
              </>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                'Save Configuration'
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

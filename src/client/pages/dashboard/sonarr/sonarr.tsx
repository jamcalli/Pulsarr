import * as React from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Loader2, Check, Trash2, RefreshCw } from 'lucide-react'
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
import { useConfig } from '@/context/context'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const sonarrConfigSchema = z.object({
  sonarrBaseUrl: z.string().url({ message: 'Please enter a valid URL' }),
  sonarrApiKey: z.string().min(1, { message: 'API Key is required' }),
  sonarrQualityProfile: z.string().min(1, { message: 'Quality Profile is required' }),
  sonarrRootFolder: z.string().min(1, { message: 'Root Folder is required' }),
  sonarrBypassIgnored: z.boolean().optional(),
  sonarrSeasonMonitoring: z.string().min(1, { message: 'Season Monitoring is required' }),
  sonarrTags: z.array(z.string()).optional()
})

type SonarrConfigSchema = z.infer<typeof sonarrConfigSchema>

export default function SonarrConfigPage() {
  const { toast } = useToast()
  const { config, updateConfig } = useConfig()
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [qualityProfiles, setQualityProfiles] = React.useState([])
  const [rootFolders, setRootFolders] = React.useState([])

  const form = useForm<SonarrConfigSchema>({
    defaultValues: {
      sonarrBaseUrl: config?.sonarrBaseUrl || '',
      sonarrApiKey: config?.sonarrApiKey || '',
      sonarrQualityProfile: config?.sonarrQualityProfile || '',
      sonarrRootFolder: config?.sonarrRootFolder || '',
      sonarrBypassIgnored: config?.sonarrBypassIgnored || false,
      sonarrSeasonMonitoring: config?.sonarrSeasonMonitoring || 'future',
      sonarrTags: config?.sonarrTags || []
    }
  })

  React.useEffect(() => {
    if (config) {
      form.reset({
        sonarrBaseUrl: config.sonarrBaseUrl,
        sonarrApiKey: config.sonarrApiKey,
        sonarrQualityProfile: config.sonarrQualityProfile,
        sonarrRootFolder: config.sonarrRootFolder,
        sonarrBypassIgnored: config.sonarrBypassIgnored,
        sonarrSeasonMonitoring: config.sonarrSeasonMonitoring,
        sonarrTags: config.sonarrTags
      })
    }
  }, [config, form])

  const testConnection = async () => {
    setStatus('loading')
    try {
      const response = await fetch('/v1/sonarr/test', {
        method: 'GET'
      })
      const result = await response.json()
      
      if (result.success) {
        setStatus('success')
        toast({
          title: 'Connection Successful',
          description: 'Successfully connected to Sonarr',
          variant: 'default'
        })
        
        // Fetch quality profiles and root folders
        await fetchQualityProfiles()
        await fetchRootFolders()
      } else {
        throw new Error('Connection test failed')
      }
    } catch (error) {
      setStatus('error')
      toast({
        title: 'Connection Failed',
        description: 'Failed to connect to Sonarr',
        variant: 'destructive'
      })
    }
  }

  const fetchQualityProfiles = async () => {
    try {
      const response = await fetch('/v1/sonarr/profiles')
      const data = await response.json()
      setQualityProfiles(data)
    } catch (error) {
      console.error('Failed to fetch quality profiles:', error)
    }
  }

  const fetchRootFolders = async () => {
    try {
      const response = await fetch('/v1/sonarr/folders')
      const data = await response.json()
      setRootFolders(data)
    } catch (error) {
      console.error('Failed to fetch root folders:', error)
    }
  }

  const onSubmit = async (data: SonarrConfigSchema) => {
    setStatus('loading')
    try {
      await updateConfig(data)
      setStatus('success')
      toast({
        title: 'Configuration Updated',
        description: 'Sonarr configuration has been updated successfully',
        variant: 'default'
      })
    } catch (error) {
      setStatus('error')
      toast({
        title: 'Update Failed',
        description: 'Failed to update Sonarr configuration',
        variant: 'destructive'
      })
    }
  }

  const clearConfig = async () => {
    setStatus('loading')
    try {
      await updateConfig({
        sonarrBaseUrl: '',
        sonarrApiKey: '',
        sonarrQualityProfile: '',
        sonarrRootFolder: '',
        sonarrBypassIgnored: false,
        sonarrSeasonMonitoring: 'future',
        sonarrTags: []
      })
      form.reset()
      setStatus('idle')
      toast({
        title: 'Configuration Cleared',
        description: 'Sonarr configuration has been cleared',
        variant: 'default'
      })
    } catch (error) {
      setStatus('error')
      toast({
        title: 'Error',
        description: 'Failed to clear configuration',
        variant: 'destructive'
      })
    }
  }

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <div className="flex portrait:flex-col gap-4">
            <div className="flex-1">
              <FormField
                control={form.control}
                name="sonarrBaseUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sonarr URL</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="http://localhost:8989" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="flex-1">
              <FormField
                control={form.control}
                name="sonarrApiKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API Key</FormLabel>
                    <FormControl>
                      <Input {...field} type="password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <Button
              type="button"
              variant="noShadow"
              onClick={testConnection}
              disabled={status === 'loading'}
            >
              {status === 'loading' ? (
                <Loader2 className="animate-spin mr-2" />
              ) : status === 'success' ? (
                <Check className="text-black mr-2" />
              ) : (
                <RefreshCw className="mr-2" />
              )}
              Test Connection
            </Button>
            <Button
              type="button"
              variant="error"
              onClick={clearConfig}
              disabled={status === 'loading'}
            >
              <Trash2 className="mr-2" />
              Clear Config
            </Button>
          </div>

          <div className="flex portrait:flex-col gap-4">
            <div className="flex-1">
              <FormField
                control={form.control}
                name="sonarrQualityProfile"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quality Profile</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select quality profile" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {qualityProfiles.map((profile: any) => (
                          <SelectItem key={profile.id} value={profile.id.toString()}>
                            {profile.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="flex-1">
              <FormField
                control={form.control}
                name="sonarrRootFolder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Root Folder</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select root folder" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {rootFolders.map((folder: any) => (
                          <SelectItem key={folder.id} value={folder.path}>
                            {folder.path}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <div className="flex portrait:flex-col gap-4">
            <div className="flex-1">
              <FormField
                control={form.control}
                name="sonarrSeasonMonitoring"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Season Monitoring</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select monitoring type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="all">All Seasons</SelectItem>
                        <SelectItem value="future">Future Seasons</SelectItem>
                        <SelectItem value="missing">Missing Episodes</SelectItem>
                        <SelectItem value="existing">Existing Episodes</SelectItem>
                        <SelectItem value="pilot">Pilot Only</SelectItem>
                        <SelectItem value="none">None</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={status === 'loading' || !form.formState.isValid}
          >
            {status === 'loading' ? (
              <Loader2 className="animate-spin mr-2" />
            ) : (
              'Save Configuration'
            )}
          </Button>
        </form>
      </Form>
    </div>
  )
}
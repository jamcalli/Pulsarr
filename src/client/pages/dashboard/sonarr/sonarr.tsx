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
import { useConfig, SonarrMonitoringType, SONARR_MONITORING_OPTIONS } from '@/context/context'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const sonarrConfigSchema = z.object({
  sonarrBaseUrl: z.string().url({ message: 'Please enter a valid URL' }),
  sonarrApiKey: z.string().min(1, { message: 'API Key is required' }),
  sonarrQualityProfile: z.string().min(1, { message: 'Quality Profile is required' }),
  sonarrRootFolder: z.string().min(1, { message: 'Root Folder is required' }),
  sonarrBypassIgnored: z.boolean().optional(),
  sonarrSeasonMonitoring: z.custom<SonarrMonitoringType>(
    (val) => Object.keys(SONARR_MONITORING_OPTIONS).includes(val as string)
  ),
  sonarrTags: z.array(z.string()).optional()
})

type SonarrConfigSchema = z.infer<typeof sonarrConfigSchema>

export default function SonarrConfigPage() {
  const { toast } = useToast()
  const { 
    config, 
    updateConfig, 
    rootFolders, 
    qualityProfiles, 
    fetchSonarrData
  } = useConfig()
  
  const [testStatus, setTestStatus] = React.useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [saveStatus, setSaveStatus] = React.useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [clearStatus, setClearStatus] = React.useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  const form = useForm<SonarrConfigSchema>({
    defaultValues: {
      sonarrBaseUrl: config?.sonarrBaseUrl || '',
      sonarrApiKey: config?.sonarrApiKey || '',
      sonarrQualityProfile: config?.sonarrQualityProfile || '',
      sonarrRootFolder: config?.sonarrRootFolder || '',
      sonarrBypassIgnored: config?.sonarrBypassIgnored || false,
      sonarrSeasonMonitoring: config?.sonarrSeasonMonitoring || 'all',
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

  const handleDropdownFocus = async () => {
    if (config?.sonarrBaseUrl && config?.sonarrApiKey) {
      await fetchSonarrData()
    }
  }

  const testConnection = async () => {
    setTestStatus('loading')
    try {
      const response = await fetch('/v1/sonarr/root-folders')
      const result = await response.json()
      
      if (result.success) {
        setTestStatus('success')
        toast({
          title: 'Connection Successful',
          description: 'Successfully connected to Sonarr',
          variant: 'default'
        })
      } else {
        throw new Error('Connection test failed')
      }
    } catch (error) {
      setTestStatus('error')
      toast({
        title: 'Connection Failed',
        description: 'Failed to connect to Sonarr',
        variant: 'destructive'
      })
    }
  }

  const onSubmit = async (data: SonarrConfigSchema) => {
    setSaveStatus('loading')
    try {
      await updateConfig(data)
      setSaveStatus('success')
      toast({
        title: 'Configuration Updated',
        description: 'Sonarr configuration has been updated successfully',
        variant: 'default'
      })
    } catch (error) {
      setSaveStatus('error')
      toast({
        title: 'Update Failed',
        description: 'Failed to update Sonarr configuration',
        variant: 'destructive'
      })
    }
  }

  const clearConfig = async () => {
    setClearStatus('loading')
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
      setClearStatus('idle')
      toast({
        title: 'Configuration Cleared',
        description: 'Sonarr configuration has been cleared',
        variant: 'default'
      })
    } catch (error) {
      setClearStatus('error')
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
              disabled={testStatus === 'loading'}
            >
              {testStatus === 'loading' ? (
                <Loader2 className="animate-spin mr-2" />
              ) : testStatus === 'success' ? (
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
              disabled={clearStatus === 'loading'}
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
                      onOpenChange={(open) => {
                        if (open) handleDropdownFocus()
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select quality profile" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {qualityProfiles?.map((profile) => (
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
                      onOpenChange={(open) => {
                        if (open) handleDropdownFocus()
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select root folder" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {rootFolders?.map((folder) => (
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
                        {Object.entries(SONARR_MONITORING_OPTIONS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
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

          <Button
            type="submit"
            disabled={saveStatus === 'loading' || !form.formState.isValid}
          >
            {saveStatus === 'loading' ? (
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
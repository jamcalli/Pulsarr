import * as React from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import {
  useConfig,
  type SonarrMonitoringType,
  SONARR_MONITORING_OPTIONS,
} from '@/context/context'

const sonarrConfigSchema = z.object({
  sonarrBaseUrl: z.string().url({ message: 'Please enter a valid URL' }),
  sonarrApiKey: z.string().min(1, { message: 'API Key is required' }),
  sonarrQualityProfile: z.string().optional(),
  sonarrRootFolder: z.string().optional(),
  sonarrBypassIgnored: z.boolean().optional(),
  sonarrSeasonMonitoring: z
    .custom<SonarrMonitoringType>((val) =>
      Object.keys(SONARR_MONITORING_OPTIONS).includes(val as string),
    )
    .optional(),
  sonarrTags: z.array(z.string()).optional(),
})

type SonarrConfigSchema = z.infer<typeof sonarrConfigSchema>

export default function SonarrConfigPage() {
  const { toast } = useToast()
  const {
    config,
    updateConfig,
    rootFolders,
    qualityProfiles,
    fetchSonarrData,
  } = useConfig()
  const [testStatus, setTestStatus] = React.useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [saveStatus, setSaveStatus] = React.useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [isConnectionValid, setIsConnectionValid] = React.useState(false)

  const form = useForm<SonarrConfigSchema>({
    defaultValues: {
      sonarrBaseUrl: config?.sonarrBaseUrl || '',
      sonarrApiKey: config?.sonarrApiKey || '',
      sonarrQualityProfile: config?.sonarrQualityProfile || '',
      sonarrRootFolder: config?.sonarrRootFolder || '',
      sonarrBypassIgnored: config?.sonarrBypassIgnored || false,
      sonarrSeasonMonitoring: config?.sonarrSeasonMonitoring || 'all',
      sonarrTags: config?.sonarrTags || [],
    },
  })

  React.useEffect(() => {
    const loadInitialData = async () => {
      if (config?.sonarrBaseUrl && config?.sonarrApiKey && !isConnectionValid) {
        try {
          await fetchSonarrData()
          setIsConnectionValid(true)
          setTestStatus('success')
        } catch (error) {
          setIsConnectionValid(false)
          setTestStatus('error')
          console.error('Failed to fetch initial Sonarr data:', error)
        }
      }
    }

    loadInitialData()
  }, [
    config?.sonarrBaseUrl,
    config?.sonarrApiKey,
    fetchSonarrData,
    isConnectionValid,
  ])

  React.useEffect(() => {
    if (config) {
      form.reset({
        sonarrBaseUrl: config.sonarrBaseUrl,
        sonarrApiKey: config.sonarrApiKey,
        sonarrQualityProfile: config.sonarrQualityProfile,
        sonarrRootFolder: config.sonarrRootFolder,
        sonarrBypassIgnored: config.sonarrBypassIgnored,
        sonarrSeasonMonitoring: config.sonarrSeasonMonitoring,
        sonarrTags: config.sonarrTags,
      })

      if (
        config.sonarrBaseUrl &&
        config.sonarrApiKey &&
        config.sonarrQualityProfile
      ) {
        setIsConnectionValid(true)
      }
    }
  }, [config, form])

  const handleDropdownFocus = async () => {
    if (isConnectionValid) {
      await fetchSonarrData()
    }
  }

  const testConnection = async () => {
    setTestStatus('loading')
    try {
      const values = form.getValues()
      await updateConfig({
        sonarrBaseUrl: values.sonarrBaseUrl,
        sonarrApiKey: values.sonarrApiKey,
      })

      const response = await fetch('/v1/sonarr/root-folders')
      const result = await response.json()

      if (result.success) {
        setTestStatus('success')
        setIsConnectionValid(true)
        await fetchSonarrData()
        toast({
          title: 'Connection Successful',
          description: 'Successfully connected to Sonarr',
          variant: 'default',
        })
      } else {
        throw new Error('Connection test failed')
      }
    } catch (error) {
      setTestStatus('error')
      setIsConnectionValid(false)
      toast({
        title: 'Connection Failed',
        description: 'Failed to connect to Sonarr',
        variant: 'destructive',
      })
    }
  }

  const clearConfig = async () => {
    setSaveStatus('loading')
    try {
      await updateConfig({
        sonarrBaseUrl: '',
        sonarrApiKey: '',
        sonarrQualityProfile: '',
        sonarrRootFolder: '',
        sonarrBypassIgnored: false,
        sonarrSeasonMonitoring: 'all',
        sonarrTags: [],
      })
      form.reset()
      setIsConnectionValid(false)
      setTestStatus('idle')
      setSaveStatus('idle')
      toast({
        title: 'Configuration Cleared',
        description: 'Sonarr configuration has been cleared',
        variant: 'default',
      })
    } catch (error) {
      setSaveStatus('error')
      toast({
        title: 'Error',
        description: 'Failed to clear configuration',
        variant: 'destructive',
      })
    }
  }

  const onSubmit = async (data: SonarrConfigSchema) => {
    if (!isConnectionValid) {
      toast({
        title: 'Connection Required',
        description:
          'Please test the connection before saving the configuration',
        variant: 'destructive',
      })
      return
    }

    setSaveStatus('loading')
    try {
      await updateConfig(data)
      setSaveStatus('success')
      toast({
        title: 'Configuration Updated',
        description: 'Sonarr configuration has been updated successfully',
        variant: 'default',
      })
    } catch (error) {
      setSaveStatus('error')
      toast({
        title: 'Update Failed',
        description: 'Failed to update Sonarr configuration',
        variant: 'destructive',
      })
    }
  }

  const [
    sonarrBaseUrl,
    sonarrApiKey,
    sonarrQualityProfile,
    sonarrRootFolder,
    sonarrSeasonMonitoring,
  ] = form.watch([
    'sonarrBaseUrl',
    'sonarrApiKey',
    'sonarrQualityProfile',
    'sonarrRootFolder',
    'sonarrSeasonMonitoring',
  ])

  const hasValidUrlAndKey = Boolean(sonarrBaseUrl && sonarrApiKey)
  const hasRequiredFields = Boolean(
    sonarrQualityProfile && sonarrRootFolder && sonarrSeasonMonitoring,
  )

  const canSave =
    saveStatus !== 'loading' &&
    form.formState.isValid &&
    hasRequiredFields &&
    (hasValidUrlAndKey ? isConnectionValid : true)

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <div className="flex portrait:flex-col gap-4">
            <div className="flex-1">
              <div className="flex items-end space-x-2">
                <FormField
                  control={form.control}
                  name="sonarrBaseUrl"
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
            </div>
            <div className="flex-1">
              <div className="flex items-end space-x-2">
                <FormField
                  control={form.control}
                  name="sonarrApiKey"
                  render={({ field }) => (
                    <FormItem className="flex-grow">
                      <FormLabel className="text-text">API Key</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          disabled={testStatus === 'loading'}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex space-x-2 shrink-0">
                  <Button
                    type="button"
                    size="icon"
                    variant="noShadow"
                    onClick={testConnection}
                    disabled={testStatus === 'loading' || !hasValidUrlAndKey}
                  >
                    {testStatus === 'loading' ? (
                      <Loader2 className="animate-spin" />
                    ) : testStatus === 'success' ? (
                      <Check className="text-black" />
                    ) : (
                      <Check />
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="error"
                    onClick={clearConfig}
                    disabled={saveStatus === 'loading' || !hasValidUrlAndKey}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex portrait:flex-col gap-4">
            <div className="flex-1">
              <FormField
                control={form.control}
                name="sonarrQualityProfile"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-text">Quality Profile</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      onOpenChange={(open) => {
                        if (open) handleDropdownFocus()
                      }}
                      disabled={!isConnectionValid}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select quality profile" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {qualityProfiles?.map((profile) => (
                          <SelectItem
                            key={profile.id}
                            value={profile.id.toString()}
                          >
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
                    <FormLabel className="text-text">Root Folder</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      onOpenChange={(open) => {
                        if (open) handleDropdownFocus()
                      }}
                      disabled={!isConnectionValid}
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
                    <FormLabel className="text-text">
                      Season Monitoring
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!isConnectionValid}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select monitoring type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(SONARR_MONITORING_OPTIONS).map(
                          ([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <Button type="submit" disabled={!canSave}>
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

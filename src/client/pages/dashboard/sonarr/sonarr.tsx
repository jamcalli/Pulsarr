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
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import {
  useConfig,
  type SonarrMonitoringType,
  SONARR_MONITORING_OPTIONS,
} from '@/context/context'

const sonarrInstanceSchema = z.object({
  name: z.string(),
  baseUrl: z.string().url({ message: 'Please enter a valid URL' }),
  apiKey: z.string().min(1, { message: 'API Key is required' }),
  qualityProfile: z.string().optional(),
  rootFolder: z.string().optional(),
  bypassIgnored: z.boolean(),
  seasonMonitoring: z.custom<SonarrMonitoringType>((val) =>
    Object.keys(SONARR_MONITORING_OPTIONS).includes(val as string),
  ),
  tags: z.array(z.string()),
  isDefault: z.boolean()
})

type SonarrInstanceSchema = z.infer<typeof sonarrInstanceSchema>

export default function SonarrConfigPage() {
  const { toast } = useToast()
  const { instances, loading, error, fetchInstances, fetchInstanceData } = useConfig()
  
  const [testStatus, setTestStatus] = React.useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [saveStatus, setSaveStatus] = React.useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [isConnectionValid, setIsConnectionValid] = React.useState(false)
  const [selectedInstance, setSelectedInstance] = React.useState<number | null>(null)

  const form = useForm<SonarrInstanceSchema>({
    defaultValues: {
      name: '',
      baseUrl: '',
      apiKey: '',
      qualityProfile: '',
      rootFolder: '',
      bypassIgnored: false,
      seasonMonitoring: 'all',
      tags: [],
      isDefault: false
    },
  })

  // Fetch instances on mount
  React.useEffect(() => {
    fetchInstances()
  }, [])

  // Set initial instance and form values when instances are loaded
  React.useEffect(() => {
    if (instances.length > 0 && !selectedInstance) {
      const firstInstance = instances[0]
      setSelectedInstance(firstInstance.id)
      setIsConnectionValid(true)
      
      // Since we already have all instance data, we can populate the form directly
      form.reset({
        name: firstInstance.name,
        baseUrl: firstInstance.baseUrl,
        apiKey: firstInstance.apiKey,
        qualityProfile: firstInstance.qualityProfile || '',
        rootFolder: firstInstance.rootFolder || '',
        bypassIgnored: firstInstance.bypassIgnored,
        seasonMonitoring: firstInstance.seasonMonitoring as SonarrMonitoringType,
        tags: firstInstance.tags,
        isDefault: firstInstance.isDefault
      })
    }
  }, [instances])

  const handleDropdownFocus = async () => {
    //if (isConnectionValid && selectedInstance) {
    //  await fetchInstanceData(selectedInstance.toString())
    //}
  }

  const testConnection = async () => {
    setTestStatus('loading')
    try {
      const values = form.getValues()
      
      const response = await fetch(`/api/test-connection?baseUrl=${values.baseUrl}&apiKey=${values.apiKey}`)
      const result = await response.json()
      
      if (result.success) {
        setTestStatus('success')
        setIsConnectionValid(true)
        if (selectedInstance) {
          await fetchInstanceData(selectedInstance.toString())
        }
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
      form.reset({
        name: '',
        baseUrl: '',
        apiKey: '',
        qualityProfile: '',
        rootFolder: '',
        bypassIgnored: false,
        seasonMonitoring: 'all',
        tags: [],
        isDefault: false
      })
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

  const onSubmit = async (data: SonarrInstanceSchema) => {
    if (!isConnectionValid) {
      toast({
        title: 'Connection Required',
        description: 'Please test the connection before saving the configuration',
        variant: 'destructive',
      })
      return
    }

    setSaveStatus('loading')
    try {
      // Implement your update instance logic here
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

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-500">
        Error loading Sonarr instances: {error}
      </div>
    )
  }

  const [
    baseUrl,
    apiKey,
    qualityProfile,
    rootFolder,
    seasonMonitoring,
  ] = form.watch([
    'baseUrl',
    'apiKey',
    'qualityProfile',
    'rootFolder',
    'seasonMonitoring',
  ])

  const hasValidUrlAndKey = Boolean(baseUrl && apiKey)
  const hasRequiredFields = Boolean(
    qualityProfile && rootFolder && seasonMonitoring,
  )
  const canSave =
    saveStatus !== 'loading' &&
    form.formState.isValid &&
    hasRequiredFields

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <div className="grid gap-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">Sonarr Instances</h2>
          <Button>Add Instance</Button>
        </div>

        {instances.length === 0 ? (
          <div className="text-center py-8">
            <p>No Sonarr instances configured</p>
            <Button className="mt-4">Add Your First Instance</Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {instances.map((instance) => (
              <Card key={instance.id}>
                <CardHeader>
                  <CardTitle className="flex justify-between items-center">
                    <span>{instance.name}</span>
                    {instance.isDefault && (
                      <span className="text-sm bg-primary/10 text-primary px-2 py-1 rounded">
                        Default
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                      <div className="flex portrait:flex-col gap-4">
                        <div className="flex-1">
                          <div className="flex items-end space-x-2">
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
                        </div>
                        <div className="flex-1">
                          <div className="flex items-end space-x-2">
                            <FormField
                              control={form.control}
                              name="apiKey"
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
                            name="qualityProfile"
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
                                    {instance.data?.qualityProfiles?.map((profile) => (
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
                            name="rootFolder"
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
                                    {instance.data?.rootFolders?.map((folder) => (
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
                            name="seasonMonitoring"
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
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
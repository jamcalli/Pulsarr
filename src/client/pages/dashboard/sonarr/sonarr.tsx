import { useState, useEffect, useCallback } from 'react'
import { useForm, type UseFormReturn } from 'react-hook-form'
import { z } from 'zod'
import { Loader2, Check, Trash2, Pen } from 'lucide-react'
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
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import {
  useConfig,
  type SonarrMonitoringType,
  SONARR_MONITORING_OPTIONS,
} from '@/context/context'
import GenreRouting from './sonarr-genre-routing'

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
  isDefault: z.boolean(),
})

type SonarrInstanceSchema = z.infer<typeof sonarrInstanceSchema>

export default function SonarrConfigPage() {
  const { toast } = useToast()
  const { instances, fetchInstanceData, fetchInstances } = useConfig()
  const [testStatus, setTestStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [isConnectionValid, setIsConnectionValid] = useState(false)
  const [selectedInstance, setSelectedInstance] = useState<number | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [showInstanceCard, setShowInstanceCard] = useState(false)

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
      isDefault: false,
    },
  })

  const API_KEY_PLACEHOLDER = 'placeholder'

  const addInstance = () => {
    setShowInstanceCard(true)
    form.reset({
      name: 'New Sonarr Instance',
      baseUrl: 'http://localhost:8989',
      apiKey: '',
      qualityProfile: '',
      rootFolder: '',
      bypassIgnored: false,
      seasonMonitoring: 'all',
      tags: [],
      isDefault: instances.length === 0,
    })
  }

  // Add this helper function outside the component
  const testConnectionWithoutLoading = useCallback(async (
    baseUrl: string,
    apiKey: string,
  ) => {
    const response = await fetch(
      `/v1/sonarr/test-connection?baseUrl=${encodeURIComponent(baseUrl)}&apiKey=${encodeURIComponent(apiKey)}`,
    )
  
    if (!response.ok) {
      throw new Error('Failed to test connection')
    }
  
    return await response.json()
  }, [])

  // Then in your initialization effect:
  useEffect(() => {
    const initializeComponent = async () => {
      if (!instances.length || isInitialized) return

      const firstInstance = instances[0]
      setSelectedInstance(firstInstance.id)

      // Check if instance already has its data
      const hasInstanceData =
        firstInstance.data?.rootFolders && firstInstance.data?.qualityProfiles
      const isPlaceholderKey = firstInstance.apiKey === API_KEY_PLACEHOLDER

      // Set initial form values
      form.reset({
        name: firstInstance.name || 'Default Instance',
        baseUrl: firstInstance.baseUrl || '',
        apiKey: isPlaceholderKey ? '' : firstInstance.apiKey || '',
        qualityProfile: firstInstance.qualityProfile || '',
        rootFolder: firstInstance.rootFolder || '',
        bypassIgnored: firstInstance.bypassIgnored || false,
        seasonMonitoring:
          (firstInstance.seasonMonitoring as SonarrMonitoringType) || 'all',
        tags: firstInstance.tags || [],
        isDefault: firstInstance.isDefault || false,
      })

      // If we have data, mark as valid immediately
      if (hasInstanceData) {
        setIsConnectionValid(true)
        setTestStatus('success')
      }
      // If we don't have data but have valid credentials, fetch them silently
      else if (
        firstInstance.baseUrl &&
        firstInstance.apiKey &&
        !isPlaceholderKey
      ) {
        try {
          const result = await testConnectionWithoutLoading(
            firstInstance.baseUrl,
            firstInstance.apiKey,
          )
          if (result.success) {
            setIsConnectionValid(true)
            setTestStatus('success')
            await fetchInstanceData(firstInstance.id.toString())
          }
        } catch (error) {
          console.error('Silent connection test failed:', error)
        }
      }

      setIsInitialized(true)
    }

    initializeComponent()
  }, [
    instances,
    isInitialized,
    form.reset,
    fetchInstanceData,
    testConnectionWithoutLoading,
  ])

  const QualityProfileSelect = ({
    field,
  }: {
    field: {
      onChange: (value: string) => void
      value?: string
      ref: React.Ref<HTMLSelectElement>
    }
  }) => (
    <Select
      onValueChange={field.onChange}
      value={field.value || ''}
      disabled={!isConnectionValid}
    >
      <FormControl>
        <SelectTrigger>
          <SelectValue placeholder="Select quality profile">
            {field.value
              ? (() => {
                  const currentInstance = instances.find(
                    (i) => i.id === selectedInstance,
                  )
                  const profile = currentInstance?.data?.qualityProfiles?.find(
                    (p) => p.id.toString() === field.value?.toString(),
                  )
                  return profile?.name || 'Select quality profile'
                })()
              : 'Select quality profile'}
          </SelectValue>
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        {instances
          .find((i) => i.id === selectedInstance)
          ?.data?.qualityProfiles?.map((profile) => (
            <SelectItem key={profile.id} value={profile.id.toString()}>
              {profile.name}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  )

  const RootFolderSelect = ({
    field,
  }: {
    field: {
      onChange: (value: string) => void
      value?: string
      ref: React.Ref<HTMLSelectElement>
    }
  }) => (
    <Select
      onValueChange={field.onChange}
      value={field.value || ''}
      disabled={!isConnectionValid}
    >
      <FormControl>
        <SelectTrigger>
          <SelectValue placeholder="Select root folder">
            {field.value
              ? (() => {
                  const currentInstance = instances.find(
                    (i) => i.id === selectedInstance,
                  )
                  const folder = currentInstance?.data?.rootFolders?.find(
                    (f) => f.path === field.value,
                  )
                  return folder?.path || 'Select root folder'
                })()
              : 'Select root folder'}
          </SelectValue>
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        {instances
          .find((i) => i.id === selectedInstance)
          ?.data?.rootFolders?.map((folder) => (
            <SelectItem key={folder.path} value={folder.path}>
              {folder.path}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  )
  const testConnection = async () => {
    const values = form.getValues()
    if (!values.name?.trim()) {
      toast({
        title: 'Name Required',
        description: 'Please provide an instance name before testing connection',
        variant: 'destructive',
      })
      return
    }
  
    setTestStatus('loading')
    try {
      // First test the connection
      const response = await fetch(
        `/v1/sonarr/test-connection?baseUrl=${encodeURIComponent(
          values.baseUrl,
        )}&apiKey=${encodeURIComponent(values.apiKey)}`,
      )
      if (!response.ok) {
        throw new Error('Failed to test connection')
      }
      const result = await response.json()
  
      if (result.success) {
        if (selectedInstance) {
          // Update existing instance
          const updateResponse = await fetch(
            `/v1/sonarr/instances/${selectedInstance}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: values.name.trim(),
                baseUrl: values.baseUrl,
                apiKey: values.apiKey,
              }),
            },
          )
          if (!updateResponse.ok) {
            throw new Error('Failed to update instance credentials')
          }
          // Fetch data for existing instance
          await fetchInstanceData(selectedInstance.toString())
        } else {
          // Create new instance
          const createResponse = await fetch('/v1/sonarr/instances', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: values.name.trim(),
              baseUrl: values.baseUrl,
              apiKey: values.apiKey,
              isDefault: instances.length === 0,
            }),
          })
          
          if (!createResponse.ok) {
            throw new Error('Failed to create new instance')
          }
          
          const newInstance = await createResponse.json()
          
          // Update selected instance and fetch its data
          setSelectedInstance(newInstance.id)
          await fetchInstances() // Refresh the instances list
          await fetchInstanceData(newInstance.id.toString())
        }
  
        setTestStatus('success')
        setIsConnectionValid(true)
        
        toast({
          title: 'Connection Successful',
          description: result.message || 'Successfully connected to Sonarr',
          variant: 'default',
        })
      } else {
        setTestStatus('error')
        setIsConnectionValid(false)
        toast({
          title: 'Connection Failed',
          description: result.message || 'Failed to connect to Sonarr',
          variant: 'destructive',
        })
      }
    } catch (error) {
      setTestStatus('error')
      setIsConnectionValid(false)
      toast({
        title: 'Connection Failed',
        description:
          error instanceof Error ? error.message : 'Failed to connect to Sonarr',
        variant: 'destructive',
      })
    }
  }

  const clearConfig = async () => {
    setSaveStatus('loading')
    try {
      if (selectedInstance) {
        // Update instance with placeholder API key
        const response = await fetch(
          `/v1/sonarr/instances/${selectedInstance}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: 'Change Me Sonarr Instance',
              baseUrl: 'http://localhost:8989',
              apiKey: API_KEY_PLACEHOLDER,
            }),
          },
        )

        if (!response.ok) {
          throw new Error('Failed to clear configuration')
        }

        // Reset form with placeholder values
        form.reset({
          name: 'Change Me Sonarr Instance',
          baseUrl: 'http://localhost:8989',
          apiKey: API_KEY_PLACEHOLDER,
          qualityProfile: '',
          rootFolder: '',
          bypassIgnored: false,
          seasonMonitoring: 'all',
          tags: [],
          isDefault: false,
        })
        
        setIsConnectionValid(false)
        setTestStatus('idle')
        setSaveStatus('idle')
        
        // Refresh the instances data to trigger the empty state
        await fetchInstances()
        setShowInstanceCard(false)
        
        toast({
          title: 'Configuration Cleared',
          description: 'Sonarr configuration has been cleared',
          variant: 'default',
        })
      }
    } catch (error) {
      setSaveStatus('error')
      toast({
        title: 'Error',
        description: 'Failed to clear configuration',
        variant: 'destructive',
      })
    } finally {
      setSaveStatus('idle')
    }
  }

  const onSubmit = async (data: SonarrInstanceSchema) => {
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
      if (selectedInstance) {
        const response = await fetch(
          `/v1/sonarr/instances/${selectedInstance}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...data,
              name: data.name.trim(),
            }),
          },
        )

        if (!response.ok) {
          throw new Error('Failed to update instance')
        }

        setSaveStatus('success')
        toast({
          title: 'Configuration Updated',
          description: 'Sonarr configuration has been updated successfully',
          variant: 'default',
        })
      }
    } catch (error) {
      setSaveStatus('error')
      toast({
        title: 'Update Failed',
        description: 'Failed to update Sonarr configuration',
        variant: 'destructive',
      })
    } finally {
      setSaveStatus('idle')
    }
  }

  const [name, baseUrl, apiKey, qualityProfile, rootFolder, seasonMonitoring] =
    form.watch([
      'name',
      'baseUrl',
      'apiKey',
      'qualityProfile',
      'rootFolder',
      'seasonMonitoring',
    ])

  // Update the hasRequiredFields check
  const hasRequiredFields = Boolean(
    name && // Add name check
      qualityProfile &&
      rootFolder &&
      seasonMonitoring,
  )

  const hasValidUrlAndKey = Boolean(baseUrl && apiKey)
  const canSave = saveStatus !== 'loading' && form.formState.isValid && hasRequiredFields

  const EditableCardHeader = ({
    instance,
    form,
  }: {
    instance: (typeof instances)[0]
    form: UseFormReturn<SonarrInstanceSchema>
  }) => {
    const [isEditing, setIsEditing] = useState(false)
    const [localName, setLocalName] = useState(form.getValues('name'))
  
    const handleNameSubmit = (e: React.FormEvent) => {
      e.preventDefault()
      if (localName?.trim()) {
        form.setValue('name', localName)
        setIsEditing(false)
      }
    }
  
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleNameSubmit(e)
      } else if (e.key === 'Escape') {
        setIsEditing(false)
        setLocalName(form.getValues('name'))
      }
    }
  
    return (
      <CardHeader className="relative">
        <CardTitle className="text-text">
          <div className="flex portrait:flex-col gap-4">
            <div className="flex-1">
              {isEditing ? (
                <div>
                  <Input
                    value={localName}
                    onChange={(e) => setLocalName(e.target.value)}
                    autoFocus
                    onKeyDown={handleKeyDown}
                    onBlur={handleNameSubmit}
                  />
                </div>
              ) : (
                <div className="group/name inline-flex items-center gap-2">
                  <span>{form.watch('name') || 'Unnamed Instance'}</span>
                  <Button
                    variant="noShadow"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover/name:opacity-100 transition-opacity"
                    onClick={() => {
                      setLocalName(form.getValues('name'))
                      setIsEditing(true)
                    }}
                  >
                    <Pen className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <div className="flex-1 flex items-center">
              {instance.isDefault && (
                <span className="text-sm bg-primary/10 text-primary px-2 py-1 rounded">
                  Default
                </span>
              )}
            </div>
          </div>
        </CardTitle>
      </CardHeader>
    )
  }

  const isPlaceholderInstance = instances.length === 1 && 
  instances[0].apiKey === API_KEY_PLACEHOLDER

if (isPlaceholderInstance && !showInstanceCard) {
  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <div className="grid gap-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-text">Sonarr Instances</h2>
        </div>
        <div className="text-center py-8 text-text">
          <p>No Sonarr instances configured</p>
          <Button onClick={addInstance} className="mt-4">
            Add Your First Instance
          </Button>
        </div>
        <GenreRouting />
      </div>
    </div>
  )
}

return (
  <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
    <div className="grid gap-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-text">Sonarr Instances</h2>
        <Button onClick={addInstance}>Add Instance</Button>
      </div>
      
      <div className="grid gap-4">
        {/* Existing Instances */}
        {instances.map((instance) => (
          !instance.apiKey || instance.apiKey !== API_KEY_PLACEHOLDER ? (
            <Card key={instance.id} className="bg-bg">
              <EditableCardHeader 
                instance={instance}
                form={form} 
              />
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
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
                              <QualityProfileSelect field={field} />
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
                              <RootFolderSelect field={field} />
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
                              <FormLabel className="text-text">Season Monitoring</FormLabel>
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
          ) : null
        ))}

        {/* New Instance Card */}
        {showInstanceCard && (
  <Card className="bg-bg">
    <EditableCardHeader 
      instance={{ 
        id: -1, 
        name: form.getValues('name'),
        baseUrl: form.getValues('baseUrl'),
        apiKey: form.getValues('apiKey'),
        bypassIgnored: form.getValues('bypassIgnored'),
        seasonMonitoring: form.getValues('seasonMonitoring'),
        tags: form.getValues('tags'),
        isDefault: instances.length === 0,
        qualityProfile: form.getValues('qualityProfile'),
        rootFolder: form.getValues('rootFolder')
      }}
      form={form} 
    />
    <CardContent>
      <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
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
                              <QualityProfileSelect field={field} />
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
                              <RootFolderSelect field={field} />
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
                              <FormLabel className="text-text">Season Monitoring</FormLabel>
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
        )}
      </div>
      <GenreRouting />
    </div>
  </div>
)

}

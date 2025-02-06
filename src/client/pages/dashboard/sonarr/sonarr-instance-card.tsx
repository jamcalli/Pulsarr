import { useState, useEffect, useCallback, useRef } from 'react'
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
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import {
  type SonarrMonitoringType,
  SONARR_MONITORING_OPTIONS,
  type SonarrInstance,
} from '@/context/context'
import { QualityProfileSelect, RootFolderSelect } from './sonarr-selects'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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

export default function InstanceCard({
  instance,
  instances,
  fetchInstanceData,
  fetchInstances,
  setShowInstanceCard,
}: {
  instance: SonarrInstance
  instances: SonarrInstance[]
  fetchInstanceData: (id: string) => Promise<void>
  fetchInstances: () => Promise<void>
  fetchAllInstanceData: () => Promise<void>
  setShowInstanceCard?: (show: boolean) => void
}) {
  const { toast } = useToast()
  const [testStatus, setTestStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [isConnectionValid, setIsConnectionValid] = useState(false)
  const hasInitialized = useRef(false)

  const form = useForm<SonarrInstanceSchema>({
    defaultValues: {
      name: instance.name,
      baseUrl: instance.baseUrl,
      apiKey: instance.apiKey,
      qualityProfile: instance.qualityProfile,
      rootFolder: instance.rootFolder,
      bypassIgnored: instance.bypassIgnored,
      seasonMonitoring: instance.seasonMonitoring as SonarrMonitoringType,
      tags: instance.tags,
      isDefault: instance.isDefault,
    },
  })

  const API_KEY_PLACEHOLDER = 'placeholder'

  const testConnectionWithoutLoading = useCallback(
    async (baseUrl: string, apiKey: string) => {
      const response = await fetch(
        `/v1/sonarr/test-connection?baseUrl=${encodeURIComponent(baseUrl)}&apiKey=${encodeURIComponent(apiKey)}`,
      )

      if (!response.ok) {
        throw new Error('Failed to test connection')
      }

      return await response.json()
    },
    [],
  )

  useEffect(() => {
    const initializeComponent = async () => {
      // Use ref to prevent multiple initializations of the same instance
      if (hasInitialized.current) return
      hasInitialized.current = true

      const hasInstanceData =
        instance.data?.rootFolders && instance.data?.qualityProfiles
      const isPlaceholderKey = instance.apiKey === API_KEY_PLACEHOLDER
  
      if (hasInstanceData) {
        setIsConnectionValid(true)
        setTestStatus('success')
      } else if (instance.baseUrl && instance.apiKey && !isPlaceholderKey) {
        try {
          const result = await testConnectionWithoutLoading(
            instance.baseUrl,
            instance.apiKey,
          )
          if (result.success) {
            setIsConnectionValid(true)
            setTestStatus('success')
            // Only fetch instance data if we don't already have it
            if (!instance.data?.rootFolders || !instance.data?.qualityProfiles) {
              await fetchInstanceData(instance.id.toString())
            }
          }
        } catch (error) {
          console.error('Silent connection test failed:', error)
        }
      }
    }
  
    initializeComponent()
  }, [instance.id])

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
      // Test connection first
      const testResponse = await fetch(
        `/v1/sonarr/test-connection?baseUrl=${encodeURIComponent(
          values.baseUrl,
        )}&apiKey=${encodeURIComponent(values.apiKey)}`,
      )
  
      if (!testResponse.ok) {
        throw new Error('Failed to test connection')
      }
  
      const testResult = await testResponse.json()
      if (!testResult.success) {
        throw new Error(testResult.message || 'Failed to connect to Sonarr')
      }
  
      // Create/Update instance
      let instanceId: string
  
      if (instance.id === -1) {
        // Creating new instance
        const createResponse = await fetch('/v1/sonarr/instances', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: values.name.trim(),
            baseUrl: values.baseUrl,
            apiKey: values.apiKey,
            isDefault: false,
          }),
        })
  
        if (!createResponse.ok) {
          throw new Error('Failed to create instance')
        }
  
        const newInstance = await createResponse.json()
        instanceId = newInstance.id.toString()
  
        // Update instances list first to include the new instance
        await fetchInstances()
        
        // Then fetch the new instance's data
        await fetchInstanceData(instanceId)
        
        setShowInstanceCard?.(false)
      } else {
        // Updating existing instance
        const updateResponse = await fetch(`/v1/sonarr/instances/${instance.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: values.name.trim(),
            baseUrl: values.baseUrl,
            apiKey: values.apiKey,
          }),
        })
  
        if (!updateResponse.ok) {
          throw new Error('Failed to update instance')
        }
  
        // For existing instance, just fetch its data
        await fetchInstanceData(instance.id.toString())
      }
  
      setTestStatus('success')
      setIsConnectionValid(true)
  
      toast({
        title: 'Connection Successful',
        description: 'Successfully connected to Sonarr',
        variant: 'default',
      })
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
      const isLastRealInstance =
        instances.filter((i) => i.apiKey !== API_KEY_PLACEHOLDER).length === 1
      if (isLastRealInstance) {
        const response = await fetch(`/v1/sonarr/instances/${instance.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Default Sonarr Instance',
            baseUrl: 'http://localhost:8989',
            apiKey: API_KEY_PLACEHOLDER,
          }),
        })

        if (!response.ok) {
          throw new Error('Failed to clear configuration')
        }

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
      } else {
        const response = await fetch(`/v1/sonarr/instances/${instance.id}`, {
          method: 'DELETE',
        })

        if (!response.ok) {
          throw new Error('Failed to delete instance')
        }
      }

      setIsConnectionValid(false)
      setTestStatus('idle')
      setSaveStatus('idle')

      await fetchInstances()
      toast({
        title: isLastRealInstance
          ? 'Configuration Cleared'
          : 'Instance Deleted',
        description: isLastRealInstance
          ? 'Sonarr configuration has been cleared'
          : 'Sonarr instance has been deleted',
        variant: 'default',
      })
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
      const response = await fetch(`/v1/sonarr/instances/${instance.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          name: data.name.trim(),
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update instance')
      }

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

  const hasRequiredFields = Boolean(
    name && qualityProfile && rootFolder && seasonMonitoring,
  )

  const hasValidUrlAndKey = Boolean(baseUrl && apiKey)
  const canSave =
    saveStatus !== 'loading' && form.formState.isValid && hasRequiredFields

  const EditableCardHeader = ({
    instance,
    form,
  }: {
    instance: SonarrInstance
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

  return (
    <Card className="bg-bg">
      <EditableCardHeader instance={instance} form={form} />
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
                      <FormLabel className="text-text">
                        Quality Profile
                      </FormLabel>
                      <QualityProfileSelect
                        field={field}
                        isConnectionValid={isConnectionValid}
                        selectedInstance={instance.id}
                        instances={instances}
                      />
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
                      <RootFolderSelect
                        field={field}
                        isConnectionValid={isConnectionValid}
                        selectedInstance={instance.id}
                        instances={instances}
                      />
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
  )
}

import { useState, useEffect, useCallback, useRef } from 'react'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import { Loader2, Check, Trash2, Pen, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import { Switch } from '@/components/ui/switch'
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
  name: z.string().min(1, 'Name is required'),
  baseUrl: z.string().url({ message: 'Please enter a valid URL' }),
  apiKey: z.string().min(1, { message: 'API Key is required' }),
  qualityProfile: z.string().min(1, 'Quality Profile is required'),
  rootFolder: z.string().min(1, 'Root Folder is required'),       
  bypassIgnored: z.boolean(),
  seasonMonitoring: z.custom<SonarrMonitoringType>((val) =>
    Object.keys(SONARR_MONITORING_OPTIONS).includes(val as string),
  ),
  tags: z.array(z.string()),
  isDefault: z.boolean(),
  syncedInstances: z.array(z.number()).optional(),
})

type SonarrInstanceSchema = z.infer<typeof sonarrInstanceSchema>

const API_KEY_PLACEHOLDER = 'placeholder'

function EditableCardHeader({
  instance,
  form,
  isEditing,
  setIsEditing,
  onSave,
  onCancel,
  onDelete,
  isSaving,
  isDirty,
  isValid,
}: {
  instance: SonarrInstance
  form: any
  isEditing: boolean
  setIsEditing: (editing: boolean) => void
  onSave: () => void
  onCancel: () => void
  onDelete?: () => void
  isSaving: boolean
  isDirty: boolean
  isValid: boolean
}) {
  const [localName, setLocalName] = useState(form.getValues('name'))

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (localName?.trim()) {
      form.setValue('name', localName.trim(), { shouldDirty: true })
      setIsEditing(false)
    }
  }

  return (
    <CardHeader>
      <CardTitle className="flex justify-between items-center text-text">
        <div className="group/name inline-flex items-center gap-2 w-1/2">
          {isEditing ? (
            <Input
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              autoFocus
              className="w-full"
              onBlur={handleNameSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleNameSubmit(e)
                } else if (e.key === 'Escape') {
                  setLocalName(form.getValues('name'))
                  setIsEditing(false)
                }
              }}
            />
          ) : (
            <div className="flex items-center gap-2">
              <span>{form.watch('name') || 'Unnamed Instance'}</span>
              {!isSaving && (
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
              )}
            </div>
          )}
          {instance.isDefault && (
            <span className="text-sm bg-primary/10 text-primary px-2 py-1 rounded">
              Default
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {(instance.id === -1 || isDirty) && (
            <Button
              variant="cancel"
              onClick={onCancel}
              className="flex items-center gap-2"
              disabled={isSaving}
              type="button"
            >
              <span>Cancel</span>
            </Button>
          )}
          
          <Button
            variant="blue"
            onClick={onSave}
            className="flex items-center gap-2"
            disabled={!isDirty || !isValid || isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>Save Changes</span>
              </>
            )}
          </Button>
          {onDelete && instance.id !== -1 && (
            <Button
              variant="error"
              size="icon"
              onClick={onDelete}
              disabled={isSaving}
              className="transition-opacity"
              type="button"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardTitle>
    </CardHeader>
  )
}

// Connection settings section with test and clear buttons
function ConnectionSettings({
  form,
  testStatus,
  onTest,
  hasValidUrlAndKey,
}: {
  form: any
  testStatus: string
  onTest: () => void
  saveStatus: string
  hasValidUrlAndKey: boolean
}) {
  return (
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
          <div className="flex shrink-0">
            <Button
              type="button"
              size="icon"
              variant="noShadow"
              onClick={onTest}
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
          </div>
        </div>
      </div>
    </div>
  )
}

function SyncedInstancesSelect({
  field,
  instances,
  currentInstanceId,
}: {
  field: any
  instances: SonarrInstance[]
  currentInstanceId: number
}) {
  const availableInstances = instances.filter(
    (inst) => inst.id !== currentInstanceId && inst.apiKey !== 'placeholder'
  )

  return (
    <Select
      onValueChange={(value) => {
        const currentSyncs = field.value || []
        const valueNum = parseInt(value)
        if (currentSyncs.includes(valueNum)) {
          field.onChange(currentSyncs.filter((id: number) => id !== valueNum))
        } else {
          field.onChange([...currentSyncs, valueNum])
        }
      }}
      value={field.value?.[0]?.toString() || ''}
    >
      <FormControl>
        <SelectTrigger>
          <SelectValue placeholder="Select instances to sync with" />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        {availableInstances.map((instance) => (
          <SelectItem
            key={instance.id}
            value={instance.id.toString()}
            className="cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <div className="flex-1">{instance.name}</div>
              {field.value?.includes(instance.id) && (
                <Check className="h-4 w-4" />
              )}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function InstanceCard({
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
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [isConnectionValid, setIsConnectionValid] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const hasInitialized = useRef(false)

  const form = useForm<SonarrInstanceSchema>({
    defaultValues: {
      name: instance.name,
      baseUrl: instance.baseUrl,
      apiKey: instance.apiKey,
      qualityProfile: instance.qualityProfile || '',
      rootFolder: instance.rootFolder || '',       
      bypassIgnored: instance.bypassIgnored,
      seasonMonitoring: instance.seasonMonitoring as SonarrMonitoringType,
      tags: instance.tags,
      isDefault: instance.isDefault,
      syncedInstances: instance.syncedInstances || [],
    },
    mode: "onChange" 
  });

  // Test connection without loading UI
  const testConnectionWithoutLoading = useCallback(
    async (baseUrl: string, apiKey: string) => {
      const minimumLoadingTime = new Promise((resolve) => setTimeout(resolve, 500))
      
      const [response] = await Promise.all([
        fetch(
          `/v1/sonarr/test-connection?baseUrl=${encodeURIComponent(baseUrl)}&apiKey=${encodeURIComponent(apiKey)}`,
        ),
        minimumLoadingTime
      ])
  
      if (!response.ok) {
        throw new Error('Failed to test connection')
      }
  
      return await response.json()
    },
    [],
  )

  // Initialize component
  useEffect(() => {
    const initializeComponent = async () => {
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
      const minimumLoadingTime = new Promise((resolve) => setTimeout(resolve, 500))
      
      await Promise.all([
        fetch(`/v1/sonarr/instances/${instance.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...data,
            name: data.name.trim(),
            syncedInstances: data.syncedInstances || [],
          }),
        }).then(async (response) => {
          if (!response.ok) {
            throw new Error('Failed to update instance')
          }
          return response
        }),
        minimumLoadingTime
      ])
  
      setSaveStatus('success')
      toast({
        title: 'Configuration Updated',
        description: 'Sonarr configuration has been updated successfully',
        variant: 'default',
      })
  
      form.reset(data)
  
      await fetchInstances()
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

  // Test connection handler
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
      const minimumLoadingTime = new Promise((resolve) => setTimeout(resolve, 500))
  
      await Promise.all([
        (async () => {
          const testResult = await testConnectionWithoutLoading(
            values.baseUrl,
            values.apiKey,
          )
          
          if (!testResult.success) {
            throw new Error(testResult.message || 'Failed to connect to Sonarr')
          }
  
          const isOnlyPlaceholderInstance = 
            instances.length === 1 && 
            instances[0].apiKey === API_KEY_PLACEHOLDER;
  
          if (isOnlyPlaceholderInstance) {

            const updateResponse = await fetch(`/v1/sonarr/instances/${instances[0].id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: values.name.trim(),
                baseUrl: values.baseUrl,
                apiKey: values.apiKey,
                isDefault: true, 
              }),
            })
  
            if (!updateResponse.ok) {
              throw new Error('Failed to update instance')
            }
  
            await fetchInstances()
            await fetchInstanceData(instances[0].id.toString())
            setShowInstanceCard?.(false)
          } else if (instance.id === -1) {
            // Create new instance only if not updating placeholder
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
            await fetchInstances()
            await fetchInstanceData(newInstance.id.toString())
            setShowInstanceCard?.(false)
          } else {
            await fetchInstanceData(instance.id.toString())
          }
        })(),
        minimumLoadingTime
      ])
  
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
          error instanceof Error
            ? error.message
            : 'Failed to connect to Sonarr',
        variant: 'destructive',
      })
    }
  }

  const clearConfig = async () => {
    try {
      const isLastRealInstance =
        instances.filter((i) => i.apiKey !== API_KEY_PLACEHOLDER).length === 1;
  
      if (isLastRealInstance) {
        // When it's the last instance, reset it to default state
        const defaultInstance: SonarrInstanceSchema = {
          name: 'Default Sonarr Instance',
          baseUrl: 'http://localhost:8989',
          apiKey: API_KEY_PLACEHOLDER,
          qualityProfile: '', 
          rootFolder: '',    
          bypassIgnored: false,
          seasonMonitoring: 'all' as SonarrMonitoringType,
          tags: [],
          isDefault: false,
          syncedInstances: [],
        };
  
        const updatePayload = {
          ...defaultInstance,
          qualityProfile: null,
          rootFolder: null,
        };
  
        const response = await fetch(`/v1/sonarr/instances/${instance.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload),
        });
  
        if (!response.ok) {
          throw new Error('Failed to clear configuration');
        }
  
        form.reset(defaultInstance, {
          keepDirty: false,
          keepIsSubmitted: false,
          keepTouched: false,
          keepIsValid: false,
          keepErrors: false,
        });
      } else {

        const response = await fetch(`/v1/sonarr/instances/${instance.id}`, {
          method: 'DELETE',
        });
  
        if (!response.ok) {
          throw new Error('Failed to delete instance');
        }
      }
  
      setIsConnectionValid(false);
      setTestStatus('idle');
  
      await fetchInstances();
      toast({
        title: isLastRealInstance ? 'Configuration Cleared' : 'Instance Deleted',
        description: isLastRealInstance
          ? 'Sonarr configuration has been cleared'
          : 'Sonarr instance has been deleted',
        variant: 'default',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to clear configuration',
        variant: 'destructive',
      });
    }
  };

  const handleSave = form.handleSubmit(onSubmit)
  const handleCancel = () => {
    if (instance.id === -1) {
      setShowInstanceCard?.(false)
    } else {

      form.reset()
    }
  }

  const values = form.watch();
  const hasValidUrlAndKey = Boolean(values.baseUrl && values.apiKey);

  return (
    <Card className="bg-bg">
      <EditableCardHeader
        instance={instance}
        form={form}
        isEditing={isEditing}
        setIsEditing={setIsEditing}
        onSave={handleSave}
        onCancel={handleCancel}
        onDelete={clearConfig}
        isSaving={saveStatus === 'loading'}
        isDirty={form.formState.isDirty}
        isValid={form.formState.isValid && isConnectionValid}
      />
      <CardContent>
        <Form {...form}>
          <form onSubmit={handleSave} className="space-y-8">
            <ConnectionSettings
              form={form}
              testStatus={testStatus}
              onTest={testConnection}
              saveStatus={saveStatus}
              hasValidUrlAndKey={hasValidUrlAndKey}
            />

            {/* Profile Settings */}
            <div className="flex portrait:flex-col gap-4">
              <div className="flex-1">
                <FormField
                  control={form.control}
                  name="qualityProfile"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-text">Quality Profile</FormLabel>
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

            {/* Instance Configuration */}
            <div className="grid lg:grid-cols-3 md:grid-cols-2 gap-4">
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

              <FormField
                control={form.control}
                name="syncedInstances"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-text">Sync With Instances</FormLabel>
                    <SyncedInstancesSelect
                      field={field}
                      instances={instances}
                      currentInstanceId={instance.id}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isDefault"
                render={({ field }) => (
                  <FormItem className="flex flex-col justify-end h-full">
                    <div className="flex items-center gap-2">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={!isConnectionValid}
                        />
                      </FormControl>
                      <FormLabel className="text-text">
                        Set as Default Instance
                      </FormLabel>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
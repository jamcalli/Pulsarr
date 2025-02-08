import { useState, useEffect, useCallback, useRef } from 'react'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import EditableCardHeader from '@/components/ui/editable-card-header'
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
import SyncedInstancesSelect from './synced-instance-select'
import ConnectionSettings from './sonarr-connection-settings'
import InstanceCardSkeleton from './instance-card-skeleton'
import DeleteInstanceAlert from './delete-instance-alert'
import { useConfig } from '@/context/context'

const baseInstanceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  baseUrl: z.string().url({ message: 'Please enter a valid URL' }),
  apiKey: z.string().min(1, { message: 'API Key is required' }),
  bypassIgnored: z.boolean(),
  seasonMonitoring: z.custom<SonarrMonitoringType>((val) =>
    Object.keys(SONARR_MONITORING_OPTIONS).includes(val as string),
  ),
  tags: z.array(z.string()),
  isDefault: z.boolean(),
  syncedInstances: z.array(z.number()).optional(),
})

const initialInstanceSchema = baseInstanceSchema.extend({
  qualityProfile: z.string(),
  rootFolder: z.string(),
})

const fullInstanceSchema = baseInstanceSchema.extend({
  qualityProfile: z.string().min(1, 'Quality Profile is required'),
  rootFolder: z.string().min(1, 'Root Folder is required'),
})

export type SonarrInstanceSchema = z.infer<typeof fullInstanceSchema>

const API_KEY_PLACEHOLDER = 'placeholder'

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
  const { instancesLoading } = useConfig()
  const [testStatus, setTestStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [isConnectionValid, setIsConnectionValid] = useState(false)
  const hasInitialized = useRef(false)
  const [showDeleteAlert, setShowDeleteAlert] = useState(false)

  const form = useForm<SonarrInstanceSchema>({
    resolver: zodResolver(
      instance.id === -1 ? initialInstanceSchema : fullInstanceSchema,
    ),
    defaultValues: {
      name: instance.name,
      baseUrl: instance.baseUrl,
      apiKey: instance.apiKey,
      qualityProfile: instance.qualityProfile || '',
      rootFolder: instance.rootFolder || '',
      bypassIgnored: instance.bypassIgnored,
      seasonMonitoring: instance.seasonMonitoring as SonarrMonitoringType,
      tags: instance.tags,
      isDefault:
        instances.length === 1 && instances[0].apiKey === API_KEY_PLACEHOLDER,
      syncedInstances: instance.syncedInstances || [],
    },
    mode: 'all',
  })

  useEffect(() => {
    if (instance.id === -1) {
      form.trigger(['baseUrl', 'apiKey'])
    }
  }, [instance.id, form])

  const testConnectionWithoutLoading = useCallback(
    async (baseUrl: string, apiKey: string) => {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

      const [response] = await Promise.all([
        fetch(
          `/v1/sonarr/test-connection?baseUrl=${encodeURIComponent(baseUrl)}&apiKey=${encodeURIComponent(apiKey)}`,
        ),
        minimumLoadingTime,
      ])

      if (!response.ok) {
        throw new Error('Failed to test connection')
      }

      return await response.json()
    },
    [],
  )

  useEffect(() => {
    const initializeComponent = async () => {
      if (hasInitialized.current) return
      hasInitialized.current = true

      const hasInstanceData = instance.data?.rootFolders && instance.data?.qualityProfiles
      const isPlaceholderKey = instance.apiKey === API_KEY_PLACEHOLDER

      if (instance.id === -1) {
        return
      }

      if (hasInstanceData) {
        setIsConnectionValid(true)
        setTestStatus('success')
      } else if (instance.baseUrl && instance.apiKey && !isPlaceholderKey) {
        try {
          const result = await testConnectionWithoutLoading(
            instance.baseUrl,
            instance.apiKey
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
  }, [instance.id, instance.data?.rootFolders, instance.data?.qualityProfiles,
      instance.baseUrl, instance.apiKey, testConnectionWithoutLoading, fetchInstanceData])

  useEffect(() => {
    if (isConnectionValid) {
      const values = form.getValues()
      const hasPlaceholderValues =
        !values.qualityProfile ||
        !values.rootFolder ||
        values.qualityProfile === '' ||
        values.rootFolder === ''

      if (hasPlaceholderValues) {
        form.clearErrors()

        form.trigger(['qualityProfile', 'rootFolder'])

        form.setValue('qualityProfile', values.qualityProfile || '', {
          shouldTouch: true,
          shouldValidate: true,
        })
        form.setValue('rootFolder', values.rootFolder || '', {
          shouldTouch: true,
          shouldValidate: true,
        })
      }
    }
  }, [isConnectionValid, form])

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
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

      if (data.isDefault && !instance.isDefault) {
        const updatePromises = instances
          .filter((inst) => inst.id !== instance.id && inst.isDefault)
          .map((inst) =>
            fetch(`/v1/sonarr/instances/${inst.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...inst,
                isDefault: false,
                syncedInstances: [],
              }),
            }),
          )

        await Promise.all(updatePromises)
      }

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
        minimumLoadingTime,
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

  useEffect(() => {
    form.reset({
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
    })

    if (
      isConnectionValid &&
      (!instance.qualityProfile || !instance.rootFolder)
    ) {
      form.trigger(['qualityProfile', 'rootFolder'])
    }
  }, [instance, form, isConnectionValid])

  const testConnection = async () => {
    const values = form.getValues()
    if (!values.name?.trim()) {
      toast({
        title: 'Name Required',
        description:
          'Please provide an instance name before testing connection',
        variant: 'destructive',
      })
      return
    }

    setTestStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

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
            instances[0].apiKey === API_KEY_PLACEHOLDER

          if (isOnlyPlaceholderInstance) {
            const updateResponse = await fetch(
              `/v1/sonarr/instances/${instances[0].id}`,
              {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  name: values.name.trim(),
                  baseUrl: values.baseUrl,
                  apiKey: values.apiKey,
                  isDefault: true,
                }),
              },
            )

            if (!updateResponse.ok) {
              throw new Error('Failed to update instance')
            }

            await fetchInstances()
            await fetchInstanceData(instances[0].id.toString())
            setShowInstanceCard?.(false)
          } else if (instance.id === -1) {
            setIsConnectionValid(true)
            setTestStatus('success')

            form.clearErrors()
            const isValid = await form.trigger(['qualityProfile', 'rootFolder'])

            if (!isValid) {
              return
            }

            const createResponse = await fetch('/v1/sonarr/instances', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: values.name.trim(),
                baseUrl: values.baseUrl,
                apiKey: values.apiKey,
                qualityProfile: values.qualityProfile,
                rootFolder: values.rootFolder,
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
        minimumLoadingTime,
      ])

      if (!instance.id || instance.id !== -1) {
        setTestStatus('success')
        setIsConnectionValid(true)
        toast({
          title: 'Connection Successful',
          description: 'Successfully connected to Sonarr',
          variant: 'default',
        })
      }
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
    setShowDeleteAlert(true)
  }

  const handleConfirmDelete = async () => {
    try {
      const isLastRealInstance =
        instances.filter((i) => i.apiKey !== API_KEY_PLACEHOLDER).length === 1

      if (isLastRealInstance) {
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
        }

        const updatePayload = {
          ...defaultInstance,
          qualityProfile: null,
          rootFolder: null,
        }

        const response = await fetch(`/v1/sonarr/instances/${instance.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload),
        })

        if (!response.ok) {
          throw new Error('Failed to clear configuration')
        }

        form.reset(defaultInstance, {
          keepDirty: false,
          keepIsSubmitted: false,
          keepTouched: false,
          keepIsValid: false,
          keepErrors: false,
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
      toast({
        title: 'Error',
        description: 'Failed to clear configuration',
        variant: 'destructive',
      })
    }
  }

  const handleSave = form.handleSubmit(onSubmit)
  const handleCancel = () => {
    if (instance.id === -1) {
      setShowInstanceCard?.(false)
    } else {
      form.reset()
    }
  }

  const values = form.watch()
  const hasValidUrlAndKey = Boolean(values.baseUrl && values.apiKey)

  if (instancesLoading && instance.id !== -1) {
    return <InstanceCardSkeleton />
  }

  return (
    <>
      <DeleteInstanceAlert
        open={showDeleteAlert}
        onOpenChange={setShowDeleteAlert}
        onConfirm={handleConfirmDelete}
        instanceName={instance.name}
        isLastInstance={
          instances.filter((i) => i.apiKey !== API_KEY_PLACEHOLDER).length === 1
        }
      />
      <Card className="bg-bg">
        <EditableCardHeader
          title={form.watch('name')}
          isNew={instance.id === -1}
          isSaving={saveStatus === 'loading'}
          isDirty={form.formState.isDirty}
          isValid={form.formState.isValid && isConnectionValid}
          badge={instance.isDefault ? { text: 'Default' } : undefined}
          onSave={handleSave}
          onCancel={handleCancel}
          onDelete={clearConfig}
          onTitleChange={(newTitle) =>
            form.setValue('name', newTitle, { shouldDirty: true })
          }
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

              {/* Instance Configuration */}
              <div className="grid lg:grid-cols-3 md:grid-cols-2 gap-4">
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

                <FormField
                  control={form.control}
                  name="syncedInstances"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-text">
                        Sync With Instances
                      </FormLabel>
                      <SyncedInstancesSelect
                        field={field}
                        instances={instances}
                        currentInstanceId={instance.id}
                        isDefault={instance.isDefault}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isDefault"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-text">
                        Default Instance
                      </FormLabel>
                      <div className="flex h-10 items-center gap-2 px-3 py-2">
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={!isConnectionValid}
                          />
                        </FormControl>
                        <span className="text-sm text-text text-muted-foreground">
                          Set as default instance
                        </span>
                      </div>
                    </FormItem>
                  )}
                />
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </>
  )
}

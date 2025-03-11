import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import EditableCardHeader from '@/components/ui/editable-card-header'
import { cn } from '@/lib/utils'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import { Switch } from '@/components/ui/switch'
import {
  QualityProfileSelect,
  RootFolderSelect,
} from '@/features/radarr/components/selects/radarr-selects'
import { useRadarrStore } from '@/features/radarr/store/radarrStore'
import { useRadarrConnection } from '@/features/radarr/hooks/instance/useRadarrConnection'
import { useRadarrInstanceForm } from '@/features/radarr/hooks/instance/useRadarrInstanceForms'
import { useRadarrInstance } from '@/features/radarr/hooks/instance/useRadarrInstance'
import SyncedInstancesSelect from '@/features/radarr/components/selects/radarr-synced-instance-select'
import ConnectionSettings from '@/features/radarr/components/instance/radarr-connection-settings'
import InstanceCardSkeleton from '@/features/radarr/components/instance/radarr-card-skeleton'
import DeleteInstanceAlert from '@/features/radarr/components/instance/delete-instance-alert'
import { RadarrSyncModal } from '@/features/radarr/components/instance/radarr-sync-modal'
import type { RadarrInstance } from '@/features/radarr/types/types'
import { useToast } from '@/hooks/use-toast'
import type { RadarrInstanceSchema } from '@/features/radarr/store/schemas'

interface InstanceCardProps {
  instance: RadarrInstance
  setShowInstanceCard?: (show: boolean) => void
}

export function InstanceCard({
  instance,
  setShowInstanceCard,
}: InstanceCardProps) {
  const { toast } = useToast()
  const [showDeleteAlert, setShowDeleteAlert] = useState(false)
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [isManualSync, setIsManualSync] = useState(false)

  const instances = useRadarrStore((state) => state.instances)
  const instancesLoading = useRadarrStore((state) => state.instancesLoading)
  const setLoadingWithMinDuration = useRadarrStore(
    (state) => state.setLoadingWithMinDuration,
  )

  const {
    instances: allInstances,
    updateInstance,
    deleteInstance,
  } = useRadarrInstance(instance.id)

  const {
    testStatus,
    saveStatus,
    isConnectionValid,
    isNavigationTest,
    setTestStatus,
    setSaveStatus,
    setIsConnectionValid,
    testConnection,
  } = useRadarrConnection(instance, setShowInstanceCard)

  const { form, resetForm, cardRef } = useRadarrInstanceForm({
    instance,
    instances: allInstances,
    isNew: instance.id === -1,
    isConnectionValid,
  })

  const handleTest = async () => {
    const values = {
      name: form.getValues('name'),
      baseUrl: form.getValues('baseUrl'),
      apiKey: form.getValues('apiKey'),
      qualityProfile: form.getValues('qualityProfile'),
      rootFolder: form.getValues('rootFolder'),
    }
    await testConnection(values, form)
  }

  const handleSubmit = async (data: RadarrInstanceSchema) => {
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
    setLoadingWithMinDuration(true)

    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 250),
      )

      const originalSyncedInstances = instance.syncedInstances || []
      const newSyncedInstances = data.syncedInstances || []

      const hasChangedSyncedInstances =
        originalSyncedInstances.length !== newSyncedInstances.length ||
        !originalSyncedInstances.every((id) =>
          newSyncedInstances.includes(id),
        ) ||
        !newSyncedInstances.every((id) => originalSyncedInstances.includes(id))

      await Promise.all([updateInstance(data), minimumLoadingTime])

      setSaveStatus('success')
      toast({
        title: 'Configuration Updated',
        description: 'Radarr configuration has been updated successfully',
        variant: 'default',
      })
      form.reset(data)

      if (hasChangedSyncedInstances && newSyncedInstances.length > 0) {
        setIsManualSync(false)
        setShowSyncModal(true)
      }
    } catch (error) {
      setSaveStatus('error')
      toast({
        title: 'Update Failed',
        description: 'Failed to update Radarr configuration',
        variant: 'destructive',
      })
    } finally {
      setLoadingWithMinDuration(false)
      setSaveStatus('idle')
    }
  }

  const handleDelete = async () => {
    try {
      await deleteInstance(form, setIsConnectionValid, setTestStatus)
    } catch (error) {}
  }

  const handleSave = form.handleSubmit(handleSubmit)
  const handleCancel = () => {
    if (instance.id === -1) {
      setShowInstanceCard?.(false)
    } else {
      resetForm()
    }
  }

  if (instancesLoading && instance.id !== -1 && isNavigationTest.current) {
    return <InstanceCardSkeleton />
  }

  return (
    <>
      <DeleteInstanceAlert
        open={showDeleteAlert}
        onOpenChange={setShowDeleteAlert}
        onConfirm={handleDelete}
        instanceName={instance.name}
        isLastInstance={
          instances.filter((i) => i.apiKey !== 'placeholder').length === 1
        }
      />
      <RadarrSyncModal
        open={showSyncModal}
        onOpenChange={setShowSyncModal}
        syncedInstances={form.watch('syncedInstances') || []}
        instanceId={instance.id}
        isManualSync={isManualSync}
      />
      <div className="relative">
        {(form.formState.isDirty || instance.id === -1) && (
          <div
            className={cn(
              'absolute -inset-0.5 rounded-lg border-2 z-50',
              instance.id === -1 ? 'border-blue' : 'border-fun',
              'animate-pulse pointer-events-none',
            )}
          />
        )}
        <Card ref={cardRef} className="bg-bg relative">
          <EditableCardHeader
            title={form.watch('name')}
            isNew={instance.id === -1}
            isSaving={saveStatus === 'loading' || instancesLoading}
            isDirty={form.formState.isDirty}
            isValid={form.formState.isValid && isConnectionValid}
            badge={instance.isDefault ? { text: 'Default' } : undefined}
            onSave={handleSave}
            onCancel={handleCancel}
            onDelete={() => setShowDeleteAlert(true)}
            onTitleChange={(title) =>
              form.setValue('name', title, { shouldDirty: true })
            }
          />
          <CardContent>
            <Form {...form}>
              <form onSubmit={handleSave} className="space-y-8">
                <ConnectionSettings
                  form={form}
                  testStatus={testStatus}
                  onTest={handleTest}
                  saveStatus={saveStatus}
                  hasValidUrlAndKey={Boolean(
                    form.watch('baseUrl') && form.watch('apiKey'),
                  )}
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
                          <FormLabel className="text-text">
                            Root Folder
                          </FormLabel>
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
                <div className="grid lg:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="syncedInstances"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-text">
                          Sync With Instances
                        </FormLabel>
                        <div className="flex gap-2 items-center w-full">
                          <div className="flex-1 min-w-0">
                            <SyncedInstancesSelect
                              field={field}
                              instances={instances}
                              currentInstanceId={instance.id}
                              isDefault={instance.isDefault}
                            />
                          </div>
                          {instance.isDefault &&
                            field.value &&
                            field.value.length > 0 && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="noShadow"
                                      size="icon"
                                      className="flex-shrink-0"
                                      onClick={() => {
                                        setIsManualSync(true)
                                        setShowSyncModal(true)
                                      }}
                                    >
                                      <RefreshCw className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Manually sync instances</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                        </div>
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
      </div>
    </>
  )
}

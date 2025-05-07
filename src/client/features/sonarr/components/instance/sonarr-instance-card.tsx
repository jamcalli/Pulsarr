import { useState, useRef, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import EditableCardHeader from '@/components/ui/editable-card-header'
import { cn } from '@/lib/utils'
import { RefreshCw, Plus } from 'lucide-react'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SONARR_MONITORING_OPTIONS } from '@/features/sonarr/store/constants'
import { useSonarrStore } from '@/features/sonarr/store/sonarrStore'
import { useSonarrConnection } from '@/features/sonarr/hooks/instance/useSonarrConnection'
import { useSonarrInstanceForm } from '@/features/sonarr/hooks/instance/useSonarrInstanceForms'
import { useSonarrInstance } from '@/features/sonarr/hooks/instance/useSonarrInstance'
import {
  QualityProfileSelect,
  RootFolderSelect,
} from '@/features/sonarr/components/selects/sonarr-selects'
import SyncedInstancesSelect from '../selects/sonarr-synced-instance-select'
import ConnectionSettings from './sonarr-connection-settings'
import InstanceCardSkeleton from './sonarr-card-skeleton'
import DeleteInstanceAlert from './delete-instance-alert'
import type { SonarrInstance } from '@/features/sonarr/types/types'
import { useToast } from '@/hooks/use-toast'
import type { SonarrInstanceSchema } from '@/features/sonarr/store/schemas'
import { SonarrSyncModal } from '@/features/sonarr/components/instance/sonarr-sync-modal'
import { useMediaQuery } from '@/hooks/use-media-query'
import {
  TagsMultiSelect,
  type TagsMultiSelectRef,
} from '@/components/ui/tag-multi-select'
import { TagCreationDialog } from '@/components/ui/tag-creation-dialog'

interface InstanceCardProps {
  instance: SonarrInstance
  setShowInstanceCard?: (show: boolean) => void
}

/**
 * Renders a configuration card for managing a Sonarr instance, providing form controls to view, edit, test, sync, and delete instance settings.
 *
 * The card includes fields for connection details, quality profile, root folder, season monitoring, instance syncing, monitoring options, default instance selection, search-on-add, and tag management. It integrates with global state, supports asynchronous operations for testing connections, saving changes, syncing, deleting, and refreshing tags, and provides user feedback through toasts and modals.
 *
 * @param instance - The Sonarr instance to display and configure.
 * @param setShowInstanceCard - Optional callback to control the visibility of the card.
 *
 * @returns The Sonarr instance configuration card UI.
 */
export function InstanceCard({
  instance,
  setShowInstanceCard,
}: InstanceCardProps) {
  const { toast } = useToast()
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [showDeleteAlert, setShowDeleteAlert] = useState(false)
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [isManualSync, setIsManualSync] = useState(false)
  const [showTagCreationDialog, setShowTagCreationDialog] = useState(false)
  const tagsSelectRef = useRef<TagsMultiSelectRef>(null)
  const instances = useSonarrStore((state) => state.instances)
  const instancesLoading = useSonarrStore((state) => state.instancesLoading)
  const setLoadingWithMinDuration = useSonarrStore(
    (state) => state.setLoadingWithMinDuration,
  )

  const {
    instances: allInstances,
    updateInstance,
    deleteInstance,
  } = useSonarrInstance(instance.id)

  const {
    testStatus,
    saveStatus,
    isConnectionValid,
    isNavigationTest,
    needsConfiguration,
    setTestStatus,
    setSaveStatus,
    setIsConnectionValid,
    testConnection,
  } = useSonarrConnection(instance, setShowInstanceCard)

  const { form, resetForm, cardRef } = useSonarrInstanceForm({
    instance,
    instances: allInstances,
    isNew: instance.id === -1,
    isConnectionValid,
  })

  // Add useEffect to preserve editing state for incomplete instances
  useEffect(() => {
    // Check if instance is incomplete but has valid connection
    const isIncomplete =
      (!instance.qualityProfile ||
        instance.qualityProfile === '' ||
        !instance.rootFolder ||
        instance.rootFolder === '') &&
      isConnectionValid

    // If instance is incomplete and not already in dirty state, force dirty state
    if (isIncomplete && !form.formState.isDirty) {
      // Mark form as dirty to preserve editing UI state (halo, save/cancel buttons)
      // Using a harmless field like name to keep the dirty state
      form.setValue('name', instance.name, { shouldDirty: true })
    }
  }, [instance, isConnectionValid, form.formState.isDirty, form])

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

  const handleSubmit = async (data: SonarrInstanceSchema) => {
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
        description: 'Sonarr configuration has been updated successfully',
        variant: 'default',
      })
      form.reset(data)

      if (hasChangedSyncedInstances && newSyncedInstances.length > 0) {
        setIsManualSync(false)
        setShowSyncModal(true)
      }
    } catch (error) {
      setSaveStatus('error')

      // Check for specific error about default instance
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      console.log('Sonarr error handling in component:', {
        errorMessage,
        error,
      }) // Debug log
      const isDefaultError = errorMessage.includes('default')

      toast({
        title: 'Update Failed',
        description: isDefaultError
          ? errorMessage // Use the actual error message from the API
          : 'Failed to update Sonarr configuration',
        variant: 'destructive',
      })

      // If it was a default error, reset the form to restore the default status
      if (isDefaultError) {
        // Reset the form but keep the current values except for isDefault
        const currentValues = form.getValues()
        form.reset({
          ...currentValues,
          isDefault: true, // Force this back to true
        })
      }
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

  // Refresh tags via the TagsMultiSelect component
  const refreshTags = async () => {
    if (instance.id <= 0) return

    try {
      // Use the TagsMultiSelect ref to refresh tags
      if (tagsSelectRef.current) {
        await tagsSelectRef.current.refetchTags()
      }
    } catch (error) {
      console.error('Error refreshing tags:', error)
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
      <SonarrSyncModal
        open={showSyncModal}
        onOpenChange={setShowSyncModal}
        syncedInstances={form.watch('syncedInstances') || []}
        instanceId={instance.id}
        isManualSync={isManualSync}
      />
      <TagCreationDialog
        open={showTagCreationDialog}
        onOpenChange={setShowTagCreationDialog}
        instanceId={instance.id}
        instanceType="sonarr"
        instanceName={instance.name}
        onSuccess={refreshTags}
      />
      <div className="relative">
        {(form.formState.isDirty ||
          instance.id === -1 ||
          needsConfiguration) && (
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
            isDirty={form.formState.isDirty || needsConfiguration}
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
                <div
                  className={`flex ${isMobile ? 'flex-col' : 'flex-row'} gap-4`}
                >
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
                <div className="grid lg:grid-cols-3 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="monitorNewItems"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-text">
                          Monitor New Items
                        </FormLabel>
                        <div className="flex h-10 items-center gap-2 px-3 py-2">
                          <FormControl>
                            <Switch
                              checked={field.value === 'all'}
                              onCheckedChange={(checked) => {
                                field.onChange(checked ? 'all' : 'none')
                              }}
                              disabled={!isConnectionValid}
                            />
                          </FormControl>
                          <span className="text-sm text-text text-muted-foreground">
                            Automatically monitor new items
                          </span>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="searchOnAdd"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-text">
                          Search on Add
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
                            Automatically search for series when added
                          </span>
                        </div>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="tags"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-text">
                          Instance Tags
                        </FormLabel>
                        <div className="flex gap-2 items-center w-full">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="noShadow"
                                  size="icon"
                                  className="flex-shrink-0"
                                  onClick={() => setShowTagCreationDialog(true)}
                                  disabled={!isConnectionValid}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Create a new tag</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>

                          <FormControl>
                            <TagsMultiSelect
                              ref={tagsSelectRef}
                              field={field}
                              instanceId={instance.id}
                              instanceType="sonarr"
                              isConnectionValid={isConnectionValid}
                              // Tag IDs are stored as strings in the form data
                            />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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

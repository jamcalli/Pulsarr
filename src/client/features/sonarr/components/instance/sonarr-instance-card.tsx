import { isRollingMonitoringOption } from '@root/types/sonarr/rolling.js'
import { HelpCircle, Plus, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import EditableCardHeader from '@/components/ui/editable-card-header'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { TagCreationDialog } from '@/components/ui/tag-creation-dialog'
import {
  TagsMultiSelect,
  type TagsMultiSelectRef,
} from '@/components/ui/tag-multi-select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { SonarrSyncModal } from '@/features/sonarr/components/instance/sonarr-sync-modal'
import {
  QualityProfileSelect,
  RootFolderSelect,
} from '@/features/sonarr/components/selects/sonarr-selects'
import {
  SERIES_TYPE_LABELS,
  SONARR_SERIES_TYPES,
} from '@/features/sonarr/constants'
import { useSonarrConnection } from '@/features/sonarr/hooks/instance/useSonarrConnection'
import { useSonarrInstance } from '@/features/sonarr/hooks/instance/useSonarrInstance'
import { useSonarrInstanceForm } from '@/features/sonarr/hooks/instance/useSonarrInstanceForms'
import {
  API_KEY_PLACEHOLDER,
  SONARR_MONITORING_OPTIONS,
} from '@/features/sonarr/store/constants'
import type { SonarrInstanceSchema } from '@/features/sonarr/store/schemas'
import { useSonarrStore } from '@/features/sonarr/store/sonarrStore'
import type { SonarrInstance } from '@/features/sonarr/types/types'
import { useMediaQuery } from '@/hooks/use-media-query'
import { cn } from '@/lib/utils'
import { useConfigStore } from '@/stores/configStore'
import SyncedInstancesSelect from '../selects/sonarr-synced-instance-select'
import DeleteInstanceAlert from './delete-instance-alert'
import InstanceCardSkeleton from './sonarr-card-skeleton'
import ConnectionSettings from './sonarr-connection-settings'

interface InstanceCardProps {
  instance: SonarrInstance
  setShowInstanceCard?: (show: boolean) => void
}

/**
 * Displays an interactive card for configuring a Sonarr instance, allowing users to view, edit, test, sync, and delete instance settings.
 *
 * The card presents a comprehensive form for managing connection details, quality profiles, root folders, monitoring and search options, tag management, season monitoring, series type, syncing with other instances, and default instance selection. It integrates with global state and handles asynchronous operations for connection testing, saving, syncing, deleting, and tag refreshing. User feedback is provided through toast notifications and modals.
 *
 * @param instance - The Sonarr instance to display and configure.
 * @param setShowInstanceCard - Optional callback to control the visibility of the card.
 * @returns The Sonarr instance configuration card UI.
 */
export function InstanceCard({
  instance,
  setShowInstanceCard,
}: InstanceCardProps) {
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
  const { config } = useConfigStore()
  const isSessionMonitoringEnabled =
    config?.plexSessionMonitoring?.enabled || false

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
      toast.error('Please test the connection before saving the configuration')
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
      toast.success('Sonarr configuration has been updated successfully')
      form.reset(data)

      if (hasChangedSyncedInstances && newSyncedInstances.length > 0) {
        setIsManualSync(false)
        setShowSyncModal(true)
      }
    } catch (error) {
      setSaveStatus('error')

      // Check for specific error about default instance
      // Get the error message either from a direct Error object or from a fetch() response
      let errorMessage = error instanceof Error ? error.message : String(error)

      // Try to extract message from response data if it's a fetch error
      try {
        if (
          error instanceof Response ||
          (typeof error === 'object' &&
            error &&
            'status' in error &&
            error.status === 400)
        ) {
          const data = await (error as Response).json()
          errorMessage = data.message || errorMessage
        }
      } catch (_e) {
        // If we can't parse the error as JSON, just use the error message we already have
      }

      console.log('Sonarr error handling in component:', {
        errorMessage,
        error,
      }) // Debug log
      const isDefaultError = errorMessage.includes('default')

      toast.error(
        isDefaultError
          ? errorMessage // Use the actual error message from the API
          : 'Failed to update Sonarr configuration',
      )

      // If it was a default error, reset the form to restore the default status
      if (isDefaultError) {
        // Reset the form but keep the current values except for isDefault
        const currentValues = form.getValues()
        form.reset({
          ...currentValues,
          // Restore the value that actually exists in the DB
          // so the form is clean and the user can proceed.
          isDefault: instance.isDefault,
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
    } catch (_error) {}
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
          instances.filter((i) => i.apiKey !== API_KEY_PLACEHOLDER).length === 1
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
        <Card ref={cardRef} className="bg-background relative">
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
                          <FormLabel className="text-foreground">
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
                          <FormLabel className="text-foreground">
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
                        <div className="flex items-center space-x-2">
                          <FormLabel className="text-foreground">
                            Monitor New Items
                          </FormLabel>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-4 w-4 text-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">
                                  When enabled, new series will automatically be
                                  monitored when added to Sonarr. When disabled,
                                  new series will be added but not monitored for
                                  new episodes.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
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
                          <span className="text-sm text-foreground text-muted-foreground">
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
                        <div className="flex items-center space-x-2">
                          <FormLabel className="text-foreground">
                            Search on Add
                          </FormLabel>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-4 w-4 text-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">
                                  When enabled, Sonarr will automatically search
                                  for episodes when a series is added. This
                                  setting can be overridden by content router
                                  rules on a per-route basis.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <div className="flex h-10 items-center gap-2 px-3 py-2">
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled={!isConnectionValid}
                            />
                          </FormControl>
                          <span className="text-sm text-foreground text-muted-foreground">
                            Automatically search for series when added
                          </span>
                        </div>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="bypassIgnored"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center space-x-2">
                          <FormLabel className="text-foreground">
                            Bypass Ignored
                          </FormLabel>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-4 w-4 text-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">
                                  When enabled, this instance will bypass any
                                  ignore exclusions. Use this when you want
                                  certain instances to process all content
                                  regardless of ignore settings.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <div className="flex h-10 items-center gap-2 px-3 py-2">
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled={!isConnectionValid}
                            />
                          </FormControl>
                          <span className="text-sm text-foreground text-muted-foreground">
                            Bypass ignore exclusions
                          </span>
                        </div>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="createSeasonFolders"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center space-x-2">
                          <FormLabel className="text-foreground">
                            Create Season Folders
                          </FormLabel>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-4 w-4 text-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">
                                  When enabled, Sonarr will create season
                                  folders (e.g., Season 01, Season 02) to
                                  organize episodes by season within each series
                                  folder.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <div className="flex h-10 items-center gap-2 px-3 py-2">
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled={!isConnectionValid}
                            />
                          </FormControl>
                          <span className="text-sm text-foreground text-muted-foreground">
                            Organize episodes in season folders
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
                        <div className="flex items-center space-x-2">
                          <FormLabel className="text-foreground">
                            Instance Tags
                          </FormLabel>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-4 w-4 text-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">
                                  Tags that are automatically applied to all
                                  series added to this Sonarr instance. Content
                                  router rules can override these tags with
                                  their own tag settings.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <div className="flex gap-2 items-center w-full">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="noShadow"
                                  size="icon"
                                  className="shrink-0"
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
                        <div className="flex items-center space-x-2">
                          <FormLabel className="text-foreground">
                            Season Monitoring
                          </FormLabel>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-4 w-4 text-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">
                                  Default season monitoring strategy for all
                                  series added to this Sonarr instance.
                                  Determines which seasons are monitored for new
                                  episodes.
                                </p>
                                {!isSessionMonitoringEnabled && (
                                  <p className="max-w-xs mt-2 text-sm text-muted-foreground">
                                    Note: Rolling monitoring options (Pilot
                                    Rolling and First Season Rolling) require
                                    Plex Session Monitoring to be enabled in
                                    Utilities.
                                  </p>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
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
                              ([value, label]) => {
                                const isRollingOption =
                                  isRollingMonitoringOption(value)
                                const isDisabled =
                                  isRollingOption && !isSessionMonitoringEnabled

                                return (
                                  <SelectItem
                                    key={value}
                                    value={value}
                                    disabled={isDisabled}
                                    className={
                                      isDisabled
                                        ? 'cursor-not-allowed opacity-50'
                                        : ''
                                    }
                                  >
                                    {label}
                                  </SelectItem>
                                )
                              },
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="seriesType"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center space-x-2">
                          <FormLabel className="text-foreground">
                            Series Type
                          </FormLabel>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-4 w-4 text-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">
                                  Default series type for all series added to
                                  this Sonarr instance. Can be overridden by
                                  content router rules.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || 'standard'}
                          disabled={!isConnectionValid}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select series type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {SONARR_SERIES_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {SERIES_TYPE_LABELS[type]}
                              </SelectItem>
                            ))}
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
                        <div className="flex items-center space-x-2">
                          <FormLabel className="text-foreground">
                            Sync With Instances
                          </FormLabel>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-4 w-4 text-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">
                                  Select instances to sync with this Sonarr
                                  instance. Any content that reaches the default
                                  instance will also be sent to the selected
                                  synced instance(s).
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
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
                                      className="shrink-0"
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
                        <div className="flex items-center space-x-2">
                          <FormLabel className="text-foreground">
                            Default Instance
                          </FormLabel>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-4 w-4 text-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">
                                  The default instance will receive all content
                                  when no specific routing rules apply. Only one
                                  instance can be set as default at a time.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <div className="flex h-10 items-center gap-2 px-3 py-2">
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled={!isConnectionValid}
                            />
                          </FormControl>
                          <span className="text-sm text-foreground text-muted-foreground">
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

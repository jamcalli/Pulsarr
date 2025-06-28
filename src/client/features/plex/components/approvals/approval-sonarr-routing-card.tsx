import { useState, useRef, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { HelpCircle, Plus, Loader2, Check } from 'lucide-react'
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
import {
  SONARR_MONITORING_OPTIONS,
  API_KEY_PLACEHOLDER,
} from '@/features/sonarr/store/constants'
import { isRollingMonitoringOption } from '@root/types/sonarr/rolling.js'
import { useSonarrStore } from '@/features/sonarr/store/sonarrStore'
import {
  QualityProfileSelect,
  RootFolderSelect,
} from '@/features/sonarr/components/selects/sonarr-selects'
import SyncedInstancesSelect from '@/features/sonarr/components/selects/sonarr-synced-instance-select'
import {
  TagsMultiSelect,
  type TagsMultiSelectRef,
} from '@/components/ui/tag-multi-select'
import { useConfigStore } from '@/stores/configStore'
import { TagCreationDialog } from '@/components/ui/tag-creation-dialog'
import {
  SONARR_SERIES_TYPES,
  SERIES_TYPE_LABELS,
} from '@/features/sonarr/constants'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useToast } from '@/hooks/use-toast'
import { useMediaQuery } from '@/hooks/use-media-query'
import type { ProposedRouting } from '@root/schemas/approval/approval.schema.js'

const approvalRoutingSchema = z.object({
  qualityProfile: z.string().min(1, 'Quality profile is required'),
  rootFolder: z.string().min(1, 'Root folder is required'),
  searchOnAdd: z.boolean(),
  monitorNewItems: z.enum(['all', 'none']),
  bypassIgnored: z.boolean(),
  createSeasonFolders: z.boolean(),
  seasonMonitoring: z.string(),
  seriesType: z.enum(['standard', 'anime', 'daily']),
  tags: z.array(z.string()),
  syncedInstances: z.array(z.number()),
  priority: z.number().min(0).max(100),
})

type ApprovalRoutingFormData = z.infer<typeof approvalRoutingSchema>

interface ApprovalSonarrRoutingCardProps {
  routing: ProposedRouting
  instanceId: number
  onSave: (updatedRouting: ProposedRouting) => Promise<void>
  onCancel: () => void
  disabled?: boolean
}

/**
 * React component for editing Sonarr routing configuration in an approval workflow.
 *
 * Presents a form card allowing users to modify routing options such as quality profile, root folder, search and monitoring settings, series type, tags, synced instances, and priority for a specific Sonarr instance. Handles form validation, asynchronous data loading, tag management, and user feedback for save and cancel actions. Inputs and actions are conditionally disabled based on connection validity, saving state, and provided props.
 *
 * @param routing - The routing configuration to edit.
 * @param instanceId - Identifier of the Sonarr instance being configured.
 * @param onSave - Callback invoked with the updated routing configuration after a successful save.
 * @param onCancel - Callback invoked to cancel editing and close the form.
 * @param disabled - Optional flag to disable all form inputs and actions.
 * @returns The rendered Sonarr routing configuration form card.
 */
export function ApprovalSonarrRoutingCard({
  routing,
  instanceId,
  onSave,
  onCancel,
  disabled = false,
}: ApprovalSonarrRoutingCardProps) {
  const { toast } = useToast()
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [savingStatus, setSavingStatus] = useState<
    'idle' | 'loading' | 'success'
  >('idle')
  const [showTagCreationDialog, setShowTagCreationDialog] = useState(false)
  const tagsSelectRef = useRef<TagsMultiSelectRef>(null)

  const instances = useSonarrStore((state) => state.instances)
  const fetchInstances = useSonarrStore((state) => state.fetchInstances)
  const fetchInstanceData = useSonarrStore((state) => state.fetchInstanceData)

  // Fetch instances when component mounts to ensure store is populated
  useEffect(() => {
    if (instances.length === 0) {
      fetchInstances()
    }
  }, [instances.length, fetchInstances])

  // Fetch specific instance data for quality profiles and root folders
  useEffect(() => {
    const targetInstance = instances.find((i) => i.id === instanceId)
    if (
      targetInstance &&
      !targetInstance.data?.qualityProfiles &&
      !targetInstance.data?.fetching
    ) {
      fetchInstanceData(instanceId.toString())
    }
  }, [instances, instanceId, fetchInstanceData])
  const { config } = useConfigStore()
  const isSessionMonitoringEnabled =
    config?.plexSessionMonitoring?.enabled || false

  // Find the target instance
  const targetInstance = instances.find((i) => i.id === instanceId)
  const instanceName = targetInstance?.name || `Sonarr Instance ${instanceId}`

  // Determine if this is the default instance
  // Check both the instance property and if the routing has syncedInstances (only default instances can have these)
  const isDefaultInstance =
    targetInstance?.isDefault ||
    (routing.syncedInstances && routing.syncedInstances.length > 0)

  const form = useForm<ApprovalRoutingFormData>({
    resolver: zodResolver(approvalRoutingSchema),
    defaultValues: {
      qualityProfile: routing.qualityProfile?.toString() || '',
      rootFolder: routing.rootFolder || '',
      searchOnAdd: routing.searchOnAdd ?? true,
      monitorNewItems: 'all' as 'all' | 'none',
      bypassIgnored: false,
      createSeasonFolders: true,
      seasonMonitoring: routing.seasonMonitoring || 'all',
      seriesType:
        (routing.seriesType as 'standard' | 'anime' | 'daily') || 'standard',
      tags: Array.isArray(routing.tags) ? routing.tags : [],
      syncedInstances: Array.isArray(routing.syncedInstances)
        ? routing.syncedInstances
        : [],
      priority: typeof routing.priority === 'number' ? routing.priority : 50,
    },
  })

  // Helper function to manage minimum loading duration (copied from approval-actions-modal)
  const withMinLoadingDuration = async (
    actionFn: () => Promise<void>,
    setStatus: (status: 'idle' | 'loading' | 'success') => void,
  ) => {
    setStatus('loading')
    const startTime = Date.now()

    try {
      await actionFn()
      setStatus('success')

      // Show success state for a moment before exiting
      setTimeout(() => {
        onCancel()
      }, 1000) // Match the success display duration
    } catch (error) {
      // On error, still reset after minimum duration
      const elapsed = Date.now() - startTime
      const remainingTime = Math.max(500 - elapsed, 0)

      setTimeout(() => {
        setStatus('idle')
      }, remainingTime)
      throw error
    }
  }

  const handleSubmit = async (data: ApprovalRoutingFormData) => {
    try {
      await withMinLoadingDuration(async () => {
        const updatedRouting: ProposedRouting = {
          ...routing,
          qualityProfile: data.qualityProfile,
          rootFolder: data.rootFolder,
          searchOnAdd: data.searchOnAdd,
          seasonMonitoring: data.seasonMonitoring,
          seriesType: data.seriesType,
          tags: data.tags,
          syncedInstances: data.syncedInstances,
          priority: data.priority,
        }

        await onSave(updatedRouting)
      }, setSavingStatus)

      toast({
        title: 'Success',
        description: 'Routing configuration updated successfully',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update routing configuration',
        variant: 'destructive',
      })
    }
  }

  const refreshTags = async () => {
    if (instanceId <= 0) return

    try {
      if (tagsSelectRef.current) {
        await tagsSelectRef.current.refetchTags()
      }
    } catch (error) {
      console.error('Error refreshing tags:', error)
      toast({
        title: 'Error',
        description: 'Failed to refresh tags. Please try again.',
        variant: 'destructive',
      })
    }
  }

  const isConnectionValid = targetInstance?.apiKey !== API_KEY_PLACEHOLDER

  return (
    <>
      <TagCreationDialog
        open={showTagCreationDialog}
        onOpenChange={setShowTagCreationDialog}
        instanceId={instanceId}
        instanceType="sonarr"
        instanceName={instanceName}
        onSuccess={refreshTags}
      />

      <div className="space-y-4">
        <div className="flex justify-between items-center text-text">
          <div className="inline-flex items-center gap-2 flex-1 min-w-0">
            {isDefaultInstance && (
              <Badge className="text-sm bg-blue">
                <span className={isMobile ? 'hidden' : 'block'}>Default</span>
                <span className={isMobile ? 'block' : 'hidden'}>D</span>
              </Badge>
            )}
            <span className="font-semibold">{instanceName}</span>
          </div>
        </div>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-6"
          >
            {/* Profile Settings */}
            <div className={`flex ${isMobile ? 'flex-col' : 'flex-row'} gap-4`}>
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
                        selectedInstance={instanceId}
                        instances={instances}
                        disabled={disabled}
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
                        selectedInstance={instanceId}
                        instances={instances}
                        disabled={disabled}
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
                name="searchOnAdd"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center space-x-2">
                      <FormLabel className="text-text">Search on Add</FormLabel>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-4 w-4 text-text cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">
                              When enabled, Sonarr will automatically search for
                              episodes when a series is added. This setting can
                              be overridden by content router rules on a
                              per-route basis.
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
                          disabled={disabled || !isConnectionValid}
                        />
                      </FormControl>
                      <span className="text-sm text-text text-muted-foreground">
                        Automatically search for episodes
                      </span>
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
                      <FormLabel className="text-text">
                        Season Monitoring
                      </FormLabel>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-4 w-4 text-text cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">
                              Default season monitoring strategy for all series
                              added to this Sonarr instance. Determines which
                              seasons are monitored for new episodes.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <FormControl>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={disabled || !isConnectionValid}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select season monitoring" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(SONARR_MONITORING_OPTIONS).map(
                            ([value, label]) => (
                              <SelectItem
                                key={value}
                                value={value}
                                disabled={
                                  !isSessionMonitoringEnabled &&
                                  isRollingMonitoringOption(value)
                                }
                              >
                                {label}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </FormControl>
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
                      <FormLabel className="text-text">Series Type</FormLabel>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-4 w-4 text-text cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">
                              Default series type for all series added to this
                              Sonarr instance. Can be overridden by content
                              router rules.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <FormControl>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={disabled || !isConnectionValid}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select series type" />
                        </SelectTrigger>
                        <SelectContent>
                          {SONARR_SERIES_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {SERIES_TYPE_LABELS[type]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Tags */}
            <FormField
              control={form.control}
              name="tags"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center space-x-2">
                    <FormLabel className="text-text">Tags</FormLabel>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-text cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">
                            Tags that are automatically applied to all series
                            added to this Sonarr instance. Content router rules
                            can override these tags with their own tag settings.
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
                            className="flex-shrink-0"
                            onClick={() => setShowTagCreationDialog(true)}
                            disabled={disabled || !isConnectionValid}
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
                      {field && (
                        <TagsMultiSelect
                          ref={tagsSelectRef}
                          field={field}
                          instanceId={instanceId}
                          instanceType="sonarr"
                          isConnectionValid={isConnectionValid}
                          disabled={disabled || !isConnectionValid}
                        />
                      )}
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Synced Instances - only show if this is the default instance and there are multiple instances */}
            {isDefaultInstance && instances.length > 1 && (
              <FormField
                control={form.control}
                name="syncedInstances"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center space-x-2">
                      <FormLabel className="text-text">
                        Synced Instances
                      </FormLabel>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-4 w-4 text-text cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">
                              Select instances to sync with this Sonarr
                              instance. Any content that reaches the default
                              instance will also be sent to the selected synced
                              instance(s).
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <SyncedInstancesSelect
                      field={{
                        onChange: field.onChange,
                        onBlur: field.onBlur,
                        value: field.value,
                        name: field.name,
                        ref: field.ref,
                      }}
                      currentInstanceId={instanceId}
                      instances={instances}
                      isDefault={isDefaultInstance || false}
                      disabled={disabled}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Action Buttons - only show when not disabled (edit mode) */}
            {!disabled && (
              <div className="flex gap-2 pt-4">
                <Button
                  type="submit"
                  disabled={!isConnectionValid || savingStatus !== 'idle'}
                  className="flex-1 flex items-center justify-center gap-2"
                >
                  {savingStatus === 'loading' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : savingStatus === 'success' ? (
                    <>
                      <Check className="h-4 w-4" />
                      Saved
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
                <Button
                  type="button"
                  variant="neutral"
                  onClick={onCancel}
                  disabled={savingStatus !== 'idle'}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            )}
          </form>
        </Form>
      </div>
    </>
  )
}

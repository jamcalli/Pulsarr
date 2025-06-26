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
import { useRadarrStore } from '@/features/radarr/store/radarrStore'
import { API_KEY_PLACEHOLDER } from '@/features/radarr/store/constants'
import type { RadarrInstanceSchema } from '@/features/radarr/store/schemas'
import {
  QualityProfileSelect,
  RootFolderSelect,
} from '@/features/radarr/components/selects/radarr-selects'
import SyncedInstancesSelect from '@/features/radarr/components/selects/radarr-synced-instance-select'
import {
  TagsMultiSelect,
  type TagsMultiSelectRef,
} from '@/components/ui/tag-multi-select'
import { TagCreationDialog } from '@/components/ui/tag-creation-dialog'
import { useForm } from 'react-hook-form'
import { useToast } from '@/hooks/use-toast'
import { useMediaQuery } from '@/hooks/use-media-query'
import type { ProposedRouting } from '@root/schemas/approval/approval.schema.js'

// Use a subset of RadarrInstanceSchema for form compatibility
type ApprovalRoutingFormData = Pick<
  RadarrInstanceSchema,
  | 'qualityProfile'
  | 'rootFolder'
  | 'searchOnAdd'
  | 'bypassIgnored'
  | 'minimumAvailability'
  | 'tags'
  | 'syncedInstances'
  | 'name'
  | 'baseUrl'
  | 'apiKey'
> & {
  monitorNewItems: boolean
  priority: number
}

interface ApprovalRadarrRoutingCardProps {
  routing: ProposedRouting
  instanceId: number
  onSave: (updatedRouting: ProposedRouting) => Promise<void>
  onCancel: () => void
  disabled?: boolean
}

/**
 * Displays a form card for editing Radarr routing settings within an approval workflow.
 *
 * Provides fields for configuring quality profile, root folder, search and monitoring options, tags, synced instances, and priority for a specific Radarr instance. Fetches and validates instance data as needed, supports tag creation and refresh, and manages form submission with user feedback. Inputs and actions are conditionally enabled based on connection validity and the disabled state.
 *
 * @param routing - The routing configuration to edit.
 * @param instanceId - The ID of the Radarr instance being configured.
 * @param onSave - Callback invoked with updated routing data when the form is submitted.
 * @param onCancel - Callback invoked to cancel editing and close the form.
 * @param disabled - Optional flag to disable all form inputs and actions.
 * @returns The rendered Radarr routing configuration form card.
 */
export function ApprovalRadarrRoutingCard({
  routing,
  instanceId,
  onSave,
  onCancel,
  disabled = false,
}: ApprovalRadarrRoutingCardProps) {
  const { toast } = useToast()
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [savingStatus, setSavingStatus] = useState<
    'idle' | 'loading' | 'success'
  >('idle')
  const [showTagCreationDialog, setShowTagCreationDialog] = useState(false)
  const tagsSelectRef = useRef<TagsMultiSelectRef>(null)

  const instances = useRadarrStore((state) => state.instances)
  const fetchInstances = useRadarrStore((state) => state.fetchInstances)
  const fetchInstanceData = useRadarrStore((state) => state.fetchInstanceData)

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

  // Find the target instance
  const targetInstance = instances.find((i) => i.id === instanceId)
  const instanceName = targetInstance?.name || `Radarr Instance ${instanceId}`

  // Determine if this is the default instance
  // Check both the instance property and if the routing has syncedInstances (only default instances can have these)
  const isDefaultInstance =
    targetInstance?.isDefault ||
    (routing.syncedInstances && routing.syncedInstances.length > 0)

  const form = useForm<ApprovalRoutingFormData>({
    defaultValues: {
      qualityProfile: routing.qualityProfile?.toString() || '',
      rootFolder: routing.rootFolder || '',
      searchOnAdd: routing.searchOnAdd ?? true,
      monitorNewItems: true,
      bypassIgnored: false,
      minimumAvailability:
        (routing.minimumAvailability as
          | 'announced'
          | 'inCinemas'
          | 'released') || 'announced',
      tags: Array.isArray(routing.tags) ? routing.tags : [],
      syncedInstances: Array.isArray(routing.syncedInstances)
        ? routing.syncedInstances
        : [],
      priority: typeof routing.priority === 'number' ? routing.priority : 50,
      name: instanceName,
      baseUrl: targetInstance?.baseUrl || '',
      apiKey: targetInstance?.apiKey || '',
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
          minimumAvailability: data.minimumAvailability,
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
    }
  }

  const isConnectionValid = targetInstance?.apiKey !== API_KEY_PLACEHOLDER

  return (
    <>
      <TagCreationDialog
        open={showTagCreationDialog}
        onOpenChange={setShowTagCreationDialog}
        instanceId={instanceId}
        instanceType="radarr"
        instanceName={instanceName}
        onSuccess={refreshTags}
      />

      <div className="space-y-4">
        <div className="flex justify-between items-center text-foreground">
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
                      <FormLabel className="text-foreground">
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
                      <FormLabel className="text-foreground">
                        Root Folder
                      </FormLabel>
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
                              When enabled, Radarr will automatically search for
                              movies when they are added. This setting can be
                              overridden by content router rules on a per-route
                              basis.
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
                      <span className="text-sm text-foreground text-muted-foreground">
                        Automatically search for movies
                      </span>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="minimumAvailability"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center space-x-2">
                      <FormLabel className="text-foreground">
                        Minimum Availability
                      </FormLabel>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-4 w-4 text-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">
                              Determines when movies are considered available:
                              <br />• <strong>Announced</strong>: As soon as
                              movie is added to TMDb
                              <br />• <strong>In Cinemas</strong>: When movie is
                              in theaters
                              <br />• <strong>Released</strong>: When
                              digital/physical release is available
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
                          <SelectValue placeholder="Select minimum availability" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="announced">Announced</SelectItem>
                          <SelectItem value="inCinemas">In Cinemas</SelectItem>
                          <SelectItem value="released">Released</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                              When enabled, new movies will automatically be
                              monitored when added to Radarr.
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
                      <span className="text-sm text-foreground text-muted-foreground">
                        Automatically monitor new items
                      </span>
                    </div>
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
                    <FormLabel className="text-foreground">Tags</FormLabel>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">
                            Tags that are automatically applied to all movies
                            added to this Radarr instance. Content router rules
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
                            className="shrink-0"
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
                          instanceType="radarr"
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
                      <FormLabel className="text-foreground">
                        Synced Instances
                      </FormLabel>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-4 w-4 text-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">
                              Select instances to sync with this Radarr
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
                      instances={instances}
                      currentInstanceId={instanceId}
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

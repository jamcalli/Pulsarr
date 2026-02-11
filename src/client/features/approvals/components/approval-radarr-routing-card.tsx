import type { ProposedRouting } from '@root/schemas/approval/approval.schema.js'
import { Check, HelpCircle, Loader2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import {
  TagsMultiSelect,
  type TagsMultiSelectRef,
} from '@/components/ui/tag-multi-select'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  QualityProfileSelect,
  RootFolderSelect,
} from '@/features/radarr/components/selects/radarr-selects'
import SyncedInstancesSelect from '@/features/radarr/components/selects/radarr-synced-instance-select'
import { API_KEY_PLACEHOLDER } from '@/features/radarr/store/constants'
import { useRadarrStore } from '@/features/radarr/store/radarrStore'
import type { RadarrInstanceSchema } from '@/features/radarr/store/schemas'
import { useMediaQuery } from '@/hooks/use-media-query'

// Use a subset of RadarrInstanceSchema for form compatibility with routing schema
type ApprovalRoutingFormData = Pick<
  RadarrInstanceSchema,
  | 'qualityProfile'
  | 'rootFolder'
  | 'searchOnAdd'
  | 'minimumAvailability'
  | 'monitor'
  | 'tags'
  | 'syncedInstances'
  | 'name'
  | 'baseUrl'
  | 'apiKey'
> & {
  priority: number
}

interface ApprovalRadarrRoutingCardProps {
  routing: ProposedRouting
  instanceId: number
  onSave: (updatedRouting: ProposedRouting) => Promise<void>
  onCancel: () => void
  disabled?: boolean
  isSaving?: boolean
  saveSuccess?: boolean
}

/**
 * Renders a form card for editing Radarr routing settings within an approval workflow.
 *
 * Provides fields for configuring quality profile, root folder, search behavior, minimum availability, tags, synced instances, and priority for a specific Radarr instance. Handles fetching and validation of instance data, supports tag creation and refresh, and displays user feedback on save or error. Form inputs and actions are conditionally enabled based on connection validity and component state.
 *
 * @param routing - The routing configuration to edit.
 * @param instanceId - The ID of the Radarr instance being configured.
 * @param onSave - Callback invoked with updated routing data on form submission.
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
  isSaving = false,
  saveSuccess = false,
}: ApprovalRadarrRoutingCardProps) {
  const isMobile = useMediaQuery('(max-width: 768px)')
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
      minimumAvailability:
        (routing.minimumAvailability as
          | 'announced'
          | 'inCinemas'
          | 'released') || 'announced',
      monitor:
        (routing.monitor as 'movieOnly' | 'movieAndCollection' | 'none') ||
        'movieOnly',
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

  // Close after success state displays
  useEffect(() => {
    if (saveSuccess) {
      const timer = setTimeout(() => {
        onCancel()
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [saveSuccess, onCancel])

  const handleSubmit = async (data: ApprovalRoutingFormData) => {
    try {
      const updatedRouting: ProposedRouting = {
        ...routing,
        qualityProfile: data.qualityProfile,
        rootFolder: data.rootFolder,
        searchOnAdd: data.searchOnAdd,
        minimumAvailability: data.minimumAvailability,
        monitor: data.monitor,
        tags: data.tags,
        syncedInstances: data.syncedInstances,
        priority: data.priority,
      }

      await onSave(updatedRouting)
      toast.success('Routing configuration updated successfully')
    } catch (_error) {
      toast.error('Failed to update routing configuration')
    }
  }

  const isConnectionValid = targetInstance?.apiKey !== API_KEY_PLACEHOLDER

  return (
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
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
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
          <div className="grid md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="searchOnAdd"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center space-x-2">
                    <FormLabel className="text-foreground">
                      Search on Add
                    </FormLabel>
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
                  </div>
                  <div className="flex h-10 items-center gap-2 px-3 py-2">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={disabled || !isConnectionValid}
                      />
                    </FormControl>
                    <span className="text-sm text-foreground">
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
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          Determines when movies are considered available:
                          <br />• <strong>Announced</strong>: As soon as movie
                          is added to TMDb
                          <br />• <strong>In Cinemas</strong>: When movie is in
                          theaters
                          <br />• <strong>Released</strong>: When
                          digital/physical release is available
                        </p>
                      </TooltipContent>
                    </Tooltip>
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
              name="monitor"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center space-x-2">
                    <FormLabel className="text-foreground">Monitor</FormLabel>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          Determines what to monitor when movies are added:
                          <br />• <strong>Movie Only</strong>: Monitor only the
                          movie itself
                          <br />• <strong>Movie and Collection</strong>: Monitor
                          the movie and its collection
                          <br />• <strong>None</strong>: Don't monitor the movie
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <FormControl>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={disabled || !isConnectionValid}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select monitor type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="movieOnly">Movie Only</SelectItem>
                        <SelectItem value="movieAndCollection">
                          Movie and Collection
                        </SelectItem>
                        <SelectItem value="none">None</SelectItem>
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
                  <FormLabel className="text-foreground">Tags</FormLabel>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        Tags that are automatically applied to all movies added
                        to this Radarr instance. Content router rules can
                        override these tags with their own tag settings.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <FormControl>
                  {field && (
                    <TagsMultiSelect
                      ref={tagsSelectRef}
                      field={field}
                      instanceId={instanceId}
                      instanceType="radarr"
                      instanceName={instanceName}
                      isConnectionValid={isConnectionValid}
                      disabled={disabled || !isConnectionValid}
                    />
                  )}
                </FormControl>
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
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          Select instances to sync with this Radarr instance.
                          Any content that reaches the default instance will
                          also be sent to the selected synced instance(s).
                        </p>
                      </TooltipContent>
                    </Tooltip>
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
                disabled={!isConnectionValid || isSaving || saveSuccess}
                className="flex-1 flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : saveSuccess ? (
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
                disabled={isSaving || saveSuccess}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          )}
        </form>
      </Form>
    </div>
  )
}

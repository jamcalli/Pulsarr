import { zodResolver } from '@hookform/resolvers/zod'
import type { ProposedRouting } from '@root/schemas/approval/approval.schema.js'
import { isRollingMonitoringOption } from '@root/types/sonarr/rolling.js'
import { Check, HelpCircle, Loader2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
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
} from '@/features/sonarr/components/selects/sonarr-selects'
import SyncedInstancesSelect from '@/features/sonarr/components/selects/sonarr-synced-instance-select'
import {
  SERIES_TYPE_LABELS,
  SONARR_SERIES_TYPES,
} from '@/features/sonarr/constants'
import {
  API_KEY_PLACEHOLDER,
  SONARR_MONITORING_OPTIONS,
} from '@/features/sonarr/store/constants'
import { useSonarrStore } from '@/features/sonarr/store/sonarrStore'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useConfigStore } from '@/stores/configStore'

const approvalRoutingSchema = z.object({
  qualityProfile: z.string().min(1, { error: 'Quality profile is required' }),
  rootFolder: z.string().min(1, { error: 'Root folder is required' }),
  searchOnAdd: z.boolean(),
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
  isSaving?: boolean
  saveSuccess?: boolean
}

/**
 * Renders a form card for editing Sonarr routing configuration within an approval workflow.
 *
 * Allows users to modify quality profile, root folder, search and monitoring options, series type, tags, synced instances, and priority for a specific Sonarr instance. Handles form validation, asynchronous data loading, tag creation, and user feedback for saving or canceling changes. Inputs and actions are conditionally disabled based on connection validity, saving state, and provided props.
 *
 * @returns The Sonarr routing configuration form card UI.
 */
export function ApprovalSonarrRoutingCard({
  routing,
  instanceId,
  onSave,
  onCancel,
  disabled = false,
  isSaving = false,
  saveSuccess = false,
}: ApprovalSonarrRoutingCardProps) {
  const isMobile = useMediaQuery('(max-width: 768px)')
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
        seasonMonitoring: data.seasonMonitoring,
        seriesType: data.seriesType,
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
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          When enabled, Sonarr will automatically search for
                          episodes when a series is added. This setting can be
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
                    <FormLabel className="text-foreground">
                      Season Monitoring
                    </FormLabel>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          Default season monitoring strategy for all series
                          added to this Sonarr instance. Determines which
                          seasons are monitored for new episodes.
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
                    <FormLabel className="text-foreground">
                      Series Type
                    </FormLabel>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          Default series type for all series added to this
                          Sonarr instance. Can be overridden by content router
                          rules.
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
                  <FormLabel className="text-foreground">Tags</FormLabel>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        Tags that are automatically applied to all series added
                        to this Sonarr instance. Content router rules can
                        override these tags with their own tag settings.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <FormControl>
                  <TagsMultiSelect
                    ref={tagsSelectRef}
                    field={field}
                    instanceId={instanceId}
                    instanceType="sonarr"
                    instanceName={instanceName}
                    isConnectionValid={isConnectionValid}
                    disabled={disabled || !isConnectionValid}
                  />
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
                          Select instances to sync with this Sonarr instance.
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

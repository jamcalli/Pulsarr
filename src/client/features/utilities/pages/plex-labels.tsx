import { useEffect } from 'react'
import { useConfigStore } from '@/stores/configStore'
import { useInitializeWithMinDuration } from '@/hooks/useInitializeWithMinDuration'
import { Button } from '@/components/ui/button'
import {
  Loader2,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Save,
  X,
  HelpCircle,
  Power,
  Clock,
} from 'lucide-react'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { TimeSelector } from '@/components/ui/time-input'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  usePlexLabels,
  isSyncLabelsResponse,
  isCleanupLabelsResponse,
} from '@/features/utilities/hooks/usePlexLabels'
import { Progress } from '@/components/ui/progress'
import { useProgressStore } from '@/stores/progressStore'
import { PlexLabelsDeleteConfirmationModal } from '@/features/utilities/components/plex-labels/plex-labels-delete-confirmation-modal'
import { useLabelingProgress } from '@/features/utilities/hooks/useLabelingProgress'
import { UtilitySectionHeader } from '@/components/ui/utility-section-header'
import { PlexLabelsPageSkeleton } from '@/features/utilities/pages/plex-labels-page-skeleton'
import { formatScheduleDisplay } from '@/lib/utils'

/**
 * Standalone Plex Labels page for managing user-based labeling in Plex.
 *
 * Provides administrators with controls to enable or disable Plex labeling, set label formats, and configure concurrency limits. Includes actions for synchronizing, cleaning up, and removing Plex labels, with real-time progress indicators, operation results, and error feedback. Safeguards prevent conflicting actions and accidental destructive operations.
 *
 * @returns A React element containing the Plex label management page.
 */
export function PlexLabelsPage() {
  const { config, initialize: configInitialize } = useConfigStore()
  const isInitializing = useInitializeWithMinDuration(configInitialize)

  const {
    form,
    isSaving,
    isToggling,
    isSyncingLabels,
    isCleaningLabels,
    isRemovingLabels,
    isLoading,
    error,
    lastResults,
    lastActionResults,
    lastRemoveResults,
    labelDefinitionsDeleted,
    isLabelDeletionComplete,
    showDeleteConfirmation,
    setShowDeleteConfirmation,
    onSubmit,
    handleCancel,
    handleToggle,
    handleSyncLabels,
    handleCleanupLabels,
    initiateRemoveLabels,
    handleRemoveLabels,
    // Full sync schedule functionality (now included in usePlexLabels)
    scheduleTime,
    dayOfWeek,
    fullSyncJob,
    formatLastRun,
    formatNextRun,
    isTogglingFullSyncStatus,
    handleToggleFullSyncStatus,
    handleTimeChange,
  } = usePlexLabels()

  // Use the custom hook for progress tracking
  const plexLabelSyncProgress = useLabelingProgress('plex-label-sync')
  const plexLabelRemovalProgress = useLabelingProgress('plex-label-removal')

  // Initialize progress connection
  useEffect(() => {
    const progressStore = useProgressStore.getState()
    progressStore.initialize()
    return () => {
      progressStore.cleanup()
    }
  }, [])

  // Determine the enabled status badge info
  const isEnabled = form.watch('enabled')

  const status = isEnabled ? 'enabled' : 'disabled'

  // Determine if label settings can be edited
  const canEditLabelSettings =
    (isLabelDeletionComplete && labelDefinitionsDeleted) ||
    !lastResults?.config?.enabled

  // Helper function to get current schedule display (form state takes precedence)
  const getCurrentScheduleDisplay = () => {
    const currentTime =
      form.formState.isDirty && form.watch('scheduleTime')
        ? (form.watch('scheduleTime') as Date)
        : scheduleTime

    const currentDay =
      form.formState.isDirty && form.watch('dayOfWeek')
        ? (form.watch('dayOfWeek') as string)
        : dayOfWeek

    return formatScheduleDisplay(currentTime, currentDay)
  }

  if (isInitializing || isLoading || !config?.plexLabelSync) {
    return <PlexLabelsPageSkeleton />
  }

  return (
    <>
      <PlexLabelsDeleteConfirmationModal
        open={showDeleteConfirmation}
        onOpenChange={setShowDeleteConfirmation}
        onConfirm={handleRemoveLabels}
        isSubmitting={isRemovingLabels}
      />

      <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
        <UtilitySectionHeader
          title="Plex Labels"
          description="Configure user-based labeling for Plex content"
          status={status}
        />

        <div className="mt-6 space-y-6">
          {/* Actions section */}
          <div>
            <h3 className="font-medium text-foreground mb-2">Actions</h3>
            <div className="flex flex-wrap items-center gap-4">
              <Button
                type="button"
                size="sm"
                onClick={() => handleToggle(!isEnabled)}
                disabled={isSaving || isToggling || form.formState.isDirty}
                variant={isEnabled ? 'error' : 'noShadow'}
                className="h-8"
              >
                {isToggling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Power className="h-4 w-4" />
                )}
                <span className="ml-2">
                  {isToggling
                    ? isEnabled
                      ? 'Disabling...'
                      : 'Enabling...'
                    : isEnabled
                      ? 'Disable'
                      : 'Enable'}
                </span>
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={handleSyncLabels}
                disabled={
                  isSyncingLabels ||
                  isToggling ||
                  !isEnabled ||
                  form.formState.isDirty
                }
                variant="noShadow"
                className="h-8"
              >
                {isSyncingLabels ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="ml-2">Sync Labels</span>
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={handleCleanupLabels}
                disabled={
                  isCleaningLabels ||
                  isToggling ||
                  !isEnabled ||
                  !form.watch('cleanupOrphanedLabels') ||
                  form.formState.isDirty
                }
                variant="noShadow"
                className="h-8"
              >
                {isCleaningLabels ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                <span className="ml-2">Clean Up</span>
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={initiateRemoveLabels}
                disabled={
                  isRemovingLabels ||
                  isToggling ||
                  !isEnabled ||
                  form.formState.isDirty
                }
                variant="error"
                className="h-8"
              >
                {isRemovingLabels ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                <span className="ml-2">Remove Pulsarr Labels</span>
              </Button>
            </div>

            {/* Notify users when they have unsaved changes */}
            {form.formState.isDirty && (
              <div className="mt-2 text-sm text-error">
                You have unsaved changes. Please save your configuration before
                performing label operations.
              </div>
            )}
          </div>

          <Separator />

          {/* Status section - displays last action results if available */}
          {(lastActionResults ||
            lastResults ||
            lastRemoveResults ||
            isSyncingLabels ||
            isRemovingLabels) && (
            <div>
              <h3 className="font-medium text-foreground mb-2">Status</h3>
              <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md">
                {/* Display appropriate status message */}
                {!(isSyncingLabels || isRemovingLabels) && (
                  <p className="text-sm text-foreground">
                    {lastRemoveResults?.message ||
                      lastActionResults?.message ||
                      lastResults?.message ||
                      'Configuration status'}
                  </p>
                )}

                {/* Progress bars for sync operations */}
                {isSyncingLabels && (
                  <div className="mt-3 space-y-3">
                    {/* Overall progress message */}
                    <p className="text-sm text-foreground mb-2">
                      Synchronizing Pulsarr labels...
                    </p>

                    {/* Plex progress bar */}
                    <div className="mb-4">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-medium text-foreground">
                          Plex
                        </span>
                        <span className="text-xs text-foreground">
                          {plexLabelSyncProgress.progress}%
                        </span>
                      </div>
                      <Progress value={plexLabelSyncProgress.progress} />
                      {plexLabelSyncProgress.message && (
                        <p className="text-xs text-foreground mt-1">
                          {plexLabelSyncProgress.message}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Progress bars for removal operations */}
                {isRemovingLabels && (
                  <div className="mt-3 space-y-3">
                    {/* Overall progress message */}
                    <p className="text-sm text-foreground mb-2">
                      Removing Pulsarr labels...
                    </p>

                    {/* Plex progress bar */}
                    <div className="mb-4">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-medium text-foreground">
                          Plex
                        </span>
                        <span className="text-xs text-foreground">
                          {plexLabelRemovalProgress.progress}%
                        </span>
                      </div>
                      <Progress value={plexLabelRemovalProgress.progress} />
                      {plexLabelRemovalProgress.message && (
                        <p className="text-xs text-foreground mt-1">
                          {plexLabelRemovalProgress.message}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {lastActionResults && !isSyncingLabels && !isRemovingLabels && (
                  <>
                    <h4 className="font-medium text-sm text-foreground mt-3 mb-1">
                      Last Operation Results
                    </h4>

                    {/* Sync results */}
                    {isSyncLabelsResponse(lastActionResults) && (
                      <div className="mt-2">
                        <h5 className="text-xs font-medium text-foreground">
                          Plex Sync Results
                        </h5>
                        <ul className="mt-1 space-y-1">
                          <li className="text-xs text-foreground">
                            Processed: {lastActionResults.results.processed},
                            Updated: {lastActionResults.results.updated},
                            Failed: {lastActionResults.results.failed}, Pending:{' '}
                            {lastActionResults.results.pending}
                          </li>
                        </ul>
                      </div>
                    )}

                    {/* Cleanup results */}
                    {isCleanupLabelsResponse(lastActionResults) && (
                      <div className="mt-2">
                        <h5 className="text-xs font-medium text-foreground">
                          Cleanup Results
                        </h5>
                        <ul className="mt-1 space-y-1">
                          <li className="text-xs text-foreground">
                            Pending: {lastActionResults.pending.removed}{' '}
                            removed, {lastActionResults.pending.failed} failed
                          </li>
                          <li className="text-xs text-foreground">
                            Orphaned: {lastActionResults.orphaned.removed}{' '}
                            removed, {lastActionResults.orphaned.failed} failed
                          </li>
                        </ul>
                      </div>
                    )}
                  </>
                )}

                {/* Label removal results */}
                {lastRemoveResults && !isRemovingLabels && (
                  <>
                    <h4 className="font-medium text-sm text-foreground mt-3 mb-1">
                      Label Removal Results
                    </h4>

                    {/* Plex removal results */}
                    <div className="mt-2">
                      <h5 className="text-xs font-medium text-foreground">
                        Plex
                      </h5>
                      <ul className="mt-1 space-y-1">
                        <li className="text-xs text-foreground">
                          Processed: {lastRemoveResults.results.processed},
                          Removed: {lastRemoveResults.results.removed}, Failed:{' '}
                          {lastRemoveResults.results.failed}
                        </li>
                      </ul>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 border border-red-500 bg-red-50 dark:bg-red-900/20 rounded-md flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-red-800 dark:text-red-300">
                  Error
                </h4>
                <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                  {error}
                </p>
              </div>
            </div>
          )}

          <Separator />

          {/* Full Sync Actions section */}
          <div>
            <h3 className="font-medium text-foreground mb-2">
              Full Sync Actions
            </h3>
            <div className="flex flex-wrap items-center gap-4">
              <Button
                type="button"
                size="sm"
                onClick={handleToggleFullSyncStatus}
                disabled={isTogglingFullSyncStatus || !isEnabled}
                variant={fullSyncJob?.enabled ? 'error' : 'noShadow'}
                className="h-8"
              >
                {isTogglingFullSyncStatus ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Power className="h-4 w-4" />
                )}
                <span className="ml-2">
                  {fullSyncJob?.enabled
                    ? 'Disable Schedule'
                    : 'Enable Schedule'}
                </span>
              </Button>
            </div>

            {/* Disabled state message */}
            {!isEnabled && (
              <div className="text-sm text-error mt-2">
                Enable Plex labeling to use the full sync schedule.
              </div>
            )}
          </div>

          <Separator />

          {/* Full Sync Status section */}
          {fullSyncJob && (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col items-center text-center">
                  <h3 className="font-medium text-sm text-foreground mb-1">
                    Schedule Status
                  </h3>
                  <p className="font-medium text-foreground">
                    {fullSyncJob.enabled ? 'Enabled' : 'Disabled'}
                  </p>
                </div>
                <div className="flex flex-col items-center text-center">
                  <h3 className="font-medium text-sm text-foreground mb-1">
                    Last Run
                  </h3>
                  <p className="font-medium text-foreground">
                    {formatLastRun(fullSyncJob.last_run)}
                  </p>
                </div>
                <div className="flex flex-col items-center text-center">
                  <h3 className="font-medium text-sm text-foreground mb-1">
                    Next Run
                  </h3>
                  <p className="font-medium text-foreground">
                    {formatNextRun(fullSyncJob.next_run)}
                  </p>
                </div>
              </div>
            </div>
          )}

          <Separator />

          {/* Schedule section */}
          <div>
            <div className="flex items-center mb-3">
              <Clock className="h-4 w-4 mr-2 text-foreground" />
              <h3 className="font-medium text-sm text-foreground">
                Full Sync Schedule
              </h3>
            </div>

            {fullSyncJob ? (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="scheduleTime"
                  render={({ field }) => (
                    <div className="shrink-0">
                      <TimeSelector
                        value={field.value || scheduleTime}
                        onChange={handleTimeChange}
                        dayOfWeek={form.watch('dayOfWeek')}
                        disabled={
                          !fullSyncJob.enabled || isTogglingFullSyncStatus
                        }
                      />
                    </div>
                  )}
                />

                {fullSyncJob.type === 'cron' &&
                  fullSyncJob.config?.expression && (
                    <div className="text-xs text-foreground">
                      <p>Current schedule: {getCurrentScheduleDisplay()}</p>
                    </div>
                  )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Loading schedule configuration...
              </div>
            )}
          </div>

          <Separator />

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <h3 className="font-medium text-sm text-foreground mb-2">
                  Label Configuration
                </h3>
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="labelPrefix"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center">
                          <FormLabel className="text-foreground">
                            Label Prefix
                          </FormLabel>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="max-w-xs space-y-2">
                                  <p>
                                    Defines the prefix used for all user labels.
                                    Username will be appended after a colon.
                                  </p>
                                  <code className="bg-slate-700 text-white px-1 py-0.5 rounded-xs block text-center">
                                    {form.watch('labelPrefix') || 'pulsarr'}
                                    :username
                                  </code>

                                  <p className="text-xs">
                                    <span className="font-semibold">
                                      Examples:
                                    </span>
                                    <br />• With default prefix:{' '}
                                    <code className="bg-slate-200 dark:bg-slate-800 px-1 rounded-xs">
                                      pulsarr:john_doe
                                    </code>
                                    <br />• With "user" prefix:{' '}
                                    <code className="bg-slate-200 dark:bg-slate-800 px-1 rounded-xs">
                                      user:john_doe
                                    </code>
                                  </p>

                                  <p className="bg-slate-100 dark:bg-slate-800 p-2 rounded-xs border border-slate-200 dark:border-slate-700 text-xs text-foreground mt-2">
                                    <strong>Note:</strong> Changing this
                                    requires removing existing Pulsarr labels
                                    first, as old labels won't be recognized
                                    with the new prefix.
                                  </p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="pulsarr"
                            disabled={!canEditLabelSettings}
                          />
                        </FormControl>
                        {isEnabled && !canEditLabelSettings && (
                          <p className="text-xs text-gray-500 mt-1">
                            You must remove existing Pulsarr labels before
                            changing the label prefix.
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          Final format:{' '}
                          <code className="bg-slate-200 dark:bg-slate-800 px-1 rounded-xs">
                            {form.watch('labelPrefix') || 'pulsarr'}:username
                          </code>
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="concurrencyLimit"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center">
                          <FormLabel className="text-foreground">
                            Concurrency Limit
                          </FormLabel>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">
                                  Maximum number of concurrent operations when
                                  processing labels. Lower values reduce server
                                  load but take longer. Recommended: 5-10.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={20}
                            {...field}
                            onChange={(e) =>
                              field.onChange(
                                Number.parseInt(e.target.value) || 5,
                              )
                            }
                          />
                        </FormControl>
                        <p className="text-xs text-gray-500 mt-1">
                          Number of concurrent operations (1-20, default: 5)
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="font-medium text-sm text-foreground mb-2">
                  Cleanup Settings
                </h3>
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="cleanupOrphanedLabels"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center space-x-3">
                          <FormControl>
                            <Switch
                              checked={field.value ?? false}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="flex items-center">
                            <FormLabel className="text-foreground">
                              Clean Up Orphaned Labels
                            </FormLabel>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="max-w-xs">
                                    Removes labels that no longer correspond to
                                    active users. Prevents accumulation of
                                    unused labels when users are deleted or
                                    renamed.
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="autoResetOnScheduledSync"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center space-x-3">
                          <FormControl>
                            <Switch
                              checked={field.value ?? false}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="flex items-center">
                            <FormLabel className="text-foreground">
                              Auto-Reset Before Sync
                            </FormLabel>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <div className="max-w-xs space-y-2">
                                    <p>
                                      Automatically reset labels before ALL sync
                                      operations to clean up dangling entries
                                      based on current removal mode settings.
                                    </p>
                                    <p>
                                      This helps maintain label consistency when
                                      switching between removal modes or when
                                      dangling entries accumulate from "keep"
                                      mode.
                                    </p>
                                    <p className="bg-slate-100 dark:bg-slate-800 p-2 rounded-xs border border-slate-200 dark:border-slate-700 text-xs text-foreground mt-2">
                                      <strong>Note:</strong> Applies to both
                                      manual and scheduled sync operations when
                                      enabled.
                                    </p>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="removedLabelMode"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <div className="flex items-center">
                          <FormLabel className="text-foreground">
                            Label Behavior on Removal
                          </FormLabel>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="max-w-xs space-y-2">
                                  <p>
                                    Controls what happens to user labels when
                                    content is removed from a user's watchlist:
                                  </p>
                                  <ul className="list-disc pl-4 space-y-1">
                                    <li>
                                      <strong>Remove</strong>: User label is
                                      removed (default)
                                    </li>
                                    <li>
                                      <strong>Keep</strong>: User label is kept
                                      forever
                                    </li>
                                    <li>
                                      <strong>Special Label</strong>: User label
                                      is removed and a "removed" label is added
                                    </li>
                                  </ul>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <FormControl>
                          <Select
                            value={field.value || 'remove'}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select behavior..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="remove">Remove</SelectItem>
                              <SelectItem value="keep">Keep</SelectItem>
                              <SelectItem value="special-label">
                                Special Label
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {form.watch('removedLabelMode') === 'special-label' && (
                    <FormField
                      control={form.control}
                      name="removedLabelPrefix"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center">
                            <FormLabel className="text-foreground">
                              Removed Label Prefix
                            </FormLabel>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <div className="max-w-xs space-y-2">
                                    <p>
                                      Label prefix used to mark content that was
                                      previously in a user's watchlist when
                                      using "Special Label" mode.
                                    </p>
                                    <p className="bg-slate-100 dark:bg-slate-800 p-2 rounded-xs border border-slate-200 dark:border-slate-700 text-xs text-foreground mt-2">
                                      <strong>Note:</strong> Changing this
                                      requires removing existing labels first,
                                      as old removed labels won't be recognized
                                      with the new value.
                                    </p>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="pulsarr:removed"
                              disabled={!canEditLabelSettings}
                            />
                          </FormControl>
                          <FormMessage />
                          {form.watch('removedLabelMode') === 'special-label' &&
                            isEnabled &&
                            !canEditLabelSettings && (
                              <p className="text-xs text-gray-500 mt-1">
                                You must remove existing Pulsarr labels before
                                changing the removed label prefix.
                              </p>
                            )}
                          <p className="text-xs text-gray-500 mt-1">
                            Label format:{' '}
                            <code className="bg-slate-200 dark:bg-slate-800 px-1 rounded-xs">
                              {form.watch('removedLabelPrefix') ||
                                'pulsarr:removed'}
                            </code>
                          </p>
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="font-medium text-sm text-foreground mb-2">
                  Tag Sync Configuration
                </h3>
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="tagSync.enabled"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center space-x-3">
                          <FormControl>
                            <Switch
                              checked={field.value ?? false}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="flex items-center">
                            <FormLabel className="text-foreground">
                              Enable Tag Syncing
                            </FormLabel>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="max-w-xs">
                                    Enable syncing of tags from Radarr and
                                    Sonarr instances as Plex labels. This allows
                                    content to be labeled with metadata from
                                    your *arr applications.
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {form.watch('tagSync.enabled') && (
                    <div className="ml-6 space-y-4 border-l-2 border-border pl-4">
                      <FormField
                        control={form.control}
                        name="tagSync.syncRadarrTags"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center space-x-3">
                              <FormControl>
                                <Switch
                                  checked={field.value ?? true}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                              <div className="flex items-center">
                                <FormLabel className="text-foreground">
                                  Sync Radarr Tags
                                </FormLabel>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="max-w-xs">
                                        Synchronize tags from configured Radarr
                                        instances as Plex labels on movies.
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="tagSync.syncSonarrTags"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center space-x-3">
                              <FormControl>
                                <Switch
                                  checked={field.value ?? true}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                              <div className="flex items-center">
                                <FormLabel className="text-foreground">
                                  Sync Sonarr Tags
                                </FormLabel>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="max-w-xs">
                                        Synchronize tags from configured Sonarr
                                        instances as Plex labels on TV shows.
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons - always show, but disable save when not dirty */}
              <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
                {form.formState.isDirty && !isSaving && !isToggling && (
                  <Button
                    type="button"
                    variant="cancel"
                    onClick={handleCancel}
                    disabled={isSaving || isToggling}
                    className="flex items-center gap-1"
                  >
                    <X className="h-4 w-4" />
                    <span>Cancel</span>
                  </Button>
                )}

                <Button
                  type="submit"
                  disabled={isSaving || isToggling || !form.formState.isDirty}
                  className="flex items-center gap-2"
                  variant="blue"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </>
  )
}

export default PlexLabelsPage

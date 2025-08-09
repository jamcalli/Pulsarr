import { useInitializeWithMinDuration } from '@/hooks/useInitializeWithMinDuration'
import { Button } from '@/components/ui/button'
import {
  Loader2,
  PlayCircle,
  AlertTriangle,
  Check,
  Power,
  Clock,
  Save,
  X,
  HelpCircle,
  Tag,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
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
import { Input } from '@/components/ui/input'
import { TimeSelector } from '@/components/ui/time-input'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useDeleteSync } from '@/features/utilities/hooks/useDeleteSync'
import { useNavigate } from 'react-router-dom'
import { useConfigStore } from '@/stores/configStore'
import { DeleteSyncConfirmationModal } from '@/features/utilities/components/delete-sync/delete-sync-confirmation-modal'
import { DeleteSyncDryRunModal } from '@/features/utilities/components/delete-sync/delete-sync-dry-run-modal'
import { useMediaQuery } from '@/hooks/use-media-query'
import { UtilitySectionHeader } from '@/components/ui/utility-section-header'
import { DeleteSyncPageSkeleton } from '@/features/utilities/components/delete-sync/delete-sync-page-skeleton'
import { formatScheduleDisplay } from '@/lib/utils'

/**
 * Renders the Delete Sync page for configuring, scheduling, and managing automated media deletion jobs.
 *
 * Provides an interface to select deletion modes (watchlist-based or tag-based), set job schedules, adjust safety and notification settings, and perform or preview deletion jobs. Includes responsive layout, contextual tooltips, validation feedback, and confirmation dialogs for critical actions.
 */
export default function DeleteSyncPage() {
  const isMobile = useMediaQuery('(max-width: 768px)')

  const {
    form,
    error,
    isDryRunLoading,
    dryRunError,
    isSaving,
    submittedValues,
    isTogglingStatus,
    isRunningJob,
    scheduleTime,
    dayOfWeek,
    deleteSyncJob,
    formatLastRun,
    formatNextRun,
    handleDryRun,
    initiateRunJob,
    handleRunNow,
    initiateToggleStatus,
    handleToggleStatus,
    onSubmit,
    handleCancel,
    handleTimeChange,
    showEnableConfirmation,
    showRunConfirmation,
    showDryRunModal,
    setShowEnableConfirmation,
    setShowRunConfirmation,
    setShowDryRunModal,
  } = useDeleteSync()

  const { initialize: configInitialize } = useConfigStore()

  const navigate = useNavigate()

  // Initialize config store with minimum duration for consistent UX
  const isInitializing = useInitializeWithMinDuration(configInitialize)

  // Determine status based on job state
  const getStatus = () => {
    if (!deleteSyncJob) return 'unknown'
    if (!deleteSyncJob.enabled) return 'disabled'
    if (deleteSyncJob.last_run?.status === 'failed') return 'failed'
    return 'enabled'
  }

  if (error) {
    return (
      <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
        <UtilitySectionHeader
          title="Delete Sync"
          description="Automatically removes content when it's no longer on any watchlists"
          status="unknown"
        />
        <div className="flex justify-center items-center h-24 text-red-500">
          <AlertTriangle className="h-6 w-6 mr-2" />
          <span>Error loading schedule: {error}</span>
        </div>
      </div>
    )
  }

  if (isInitializing || !deleteSyncJob) {
    return <DeleteSyncPageSkeleton />
  }

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <DeleteSyncConfirmationModal
        open={showEnableConfirmation}
        onOpenChange={setShowEnableConfirmation}
        onConfirm={() => handleToggleStatus(deleteSyncJob?.enabled || false)}
        mode="enable"
        isSubmitting={isTogglingStatus}
      />

      <DeleteSyncConfirmationModal
        open={showRunConfirmation}
        onOpenChange={setShowRunConfirmation}
        onConfirm={handleRunNow}
        mode="run"
        isSubmitting={isRunningJob}
      />

      <DeleteSyncDryRunModal
        open={showDryRunModal}
        onOpenChange={setShowDryRunModal}
      />

      <UtilitySectionHeader
        title="Delete Sync"
        description="Automatically removes content when it's no longer on any watchlists"
        status={getStatus()}
      />

      <div className="space-y-6">
        {/* Actions section */}
        <div>
          <h3 className="font-medium text-foreground mb-2">Actions</h3>
          <div className="flex flex-wrap items-center gap-4">
            <Button
              type="button"
              size="sm"
              onClick={initiateToggleStatus}
              disabled={isTogglingStatus || !deleteSyncJob}
              variant={deleteSyncJob?.enabled ? 'error' : 'noShadow'}
              className="h-8"
            >
              {isTogglingStatus ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Power className="h-4 w-4" />
              )}
              <span className="ml-2">
                {deleteSyncJob?.enabled ? 'Disable' : 'Enable'}
              </span>
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={initiateRunJob}
              disabled={!deleteSyncJob?.enabled || isRunningJob}
              variant="noShadow"
              className="h-8"
            >
              {isRunningJob ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4" />
              )}
              <span className="ml-2">Run Now</span>
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={handleDryRun}
              disabled={isDryRunLoading}
              variant="noShadow"
              className="h-8"
            >
              {isDryRunLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              <span className="ml-2">Dry Run</span>
            </Button>
          </div>
        </div>

        <Separator />

        {/* Status section */}
        <div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col items-center text-center">
              <h3 className="font-medium text-sm text-foreground mb-1">
                Status
              </h3>
              <p className="font-medium text-foreground">
                {deleteSyncJob?.enabled ? 'Enabled' : 'Disabled'}
              </p>
            </div>
            <div className="flex flex-col items-center text-center">
              <h3 className="font-medium text-sm text-foreground mb-1">
                Last Run
              </h3>
              <p className="font-medium text-foreground flex items-center">
                {formatLastRun(deleteSyncJob?.last_run)}
                {deleteSyncJob?.last_run?.status === 'failed' && (
                  <span className="text-red-500 ml-2 flex items-center">
                    <AlertTriangle className="h-4 w-4 mr-1" />
                    Failed
                  </span>
                )}
              </p>
            </div>
            <div className="flex flex-col items-center text-center">
              <h3 className="font-medium text-sm text-foreground mb-1">
                Next Scheduled Run
              </h3>
              <p className="font-medium text-foreground">
                {formatNextRun(deleteSyncJob?.next_run)}
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Schedule section */}
        <div>
          <div className="flex items-center mb-3">
            <Clock className="h-4 w-4 mr-2 text-foreground" />
            <h3 className="font-medium text-sm text-foreground">Schedule</h3>
          </div>

          <FormField
            control={form.control}
            name="scheduleTime"
            render={({ field }) => (
              <div className="shrink-0">
                <TimeSelector
                  value={field.value || scheduleTime}
                  onChange={handleTimeChange}
                  dayOfWeek={form.watch('dayOfWeek')}
                  className={
                    isMobile
                      ? 'flex-col items-start justify-start gap-3 w-full'
                      : ''
                  }
                />
              </div>
            )}
          />

          {deleteSyncJob &&
            deleteSyncJob.type === 'cron' &&
            deleteSyncJob.config?.expression && (
              <div className="mt-2 text-xs text-foreground">
                <p>
                  Current schedule:{' '}
                  {deleteSyncJob.config.expression === '0 0 * * * *'
                    ? 'Every hour'
                    : formatScheduleDisplay(
                        isSaving &&
                          submittedValues &&
                          submittedValues.scheduleTime
                          ? submittedValues.scheduleTime
                          : scheduleTime,
                        isSaving && submittedValues && submittedValues.dayOfWeek
                          ? submittedValues.dayOfWeek
                          : dayOfWeek,
                      )}
                </p>
              </div>
            )}
        </div>

        <Separator />

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="font-medium text-sm text-foreground mb-2">
                  Deletion Mode
                </h3>
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="deletionMode"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <div className="flex items-center">
                          <FormLabel className="text-foreground m-0">
                            Mode
                          </FormLabel>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="max-w-xs space-y-2">
                                  <p>
                                    Choose how content deletion should work:
                                  </p>
                                  <ul className="list-disc pl-4 text-sm">
                                    <li>
                                      <strong>Watchlist-based:</strong> Delete
                                      content that's no longer on any watchlist.
                                    </li>
                                    <li>
                                      <strong>Tag-based:</strong> Only delete
                                      content that has the "
                                      {form.watch('removedTagPrefix') ||
                                        'pulsarr:removed'}
                                      " tag.
                                    </li>
                                  </ul>
                                  <p className="bg-slate-100 dark:bg-slate-800 p-2 rounded-xs border border-slate-200 dark:border-slate-700 text-xs text-foreground mt-2">
                                    <strong>Note:</strong> Tag-based deletion
                                    requires "Tag Behavior on Removal" to be set
                                    to <strong>"Special Tag"</strong> in the
                                    User Tags section. This ensures content is
                                    properly tagged when removed from watchlists
                                    for later deletion.
                                  </p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <FormControl>
                          <div className="flex flex-col space-y-1.5">
                            <Select
                              onValueChange={field.onChange}
                              value={field.value || 'watchlist'}
                              disabled={isSaving}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select deletion mode" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="watchlist">
                                  Watchlist-based
                                </SelectItem>
                                <SelectItem value="tag-based">
                                  Tag-based (
                                  {form.watch('removedTagPrefix') ||
                                    'pulsarr:removed'}
                                  )
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </FormControl>
                        <FormMessage />
                        {field.value === 'tag-based' &&
                          form.watch('removedTagMode') !== 'special-tag' && (
                            <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-900/20 rounded-md">
                              <div className="flex items-start space-x-2">
                                <AlertTriangle className="h-4 w-4 mt-0.5 text-yellow-600 dark:text-yellow-500 shrink-0" />
                                <p className="text-xs text-yellow-800 dark:text-yellow-400">
                                  <strong>Configuration Warning:</strong>{' '}
                                  Tag-based deletion requires "Tag Behavior on
                                  Removal" to be set to "Special Tag" in the
                                  User Tags section. Current setting is "
                                  {form.watch('removedTagMode') || 'remove'}".{' '}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      navigate('/utilities/user-tags')
                                    }
                                    className="underline font-medium hover:text-yellow-900 dark:hover:text-yellow-300 cursor-pointer"
                                  >
                                    Configure User Tags
                                  </button>
                                </p>
                              </div>
                            </div>
                          )}
                      </FormItem>
                    )}
                  />
                </div>

                {form.watch('deletionMode') === 'tag-based' && (
                  <div className="mt-4">
                    <div className="flex items-center mb-2">
                      <FormLabel className="text-foreground m-0">
                        Removal Tag Name
                      </FormLabel>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="max-w-xs space-y-2">
                              <p>
                                This tag is used to mark content for deletion in
                                tag-based deletion mode. Any content with this
                                exact tag will be deleted during the sync job.
                              </p>
                              <p className="bg-slate-100 dark:bg-slate-800 p-2 rounded-xs border border-slate-200 dark:border-slate-700 text-xs text-foreground mt-2">
                                <strong>Note:</strong> This value is configured
                                in the User Tags section with the{' '}
                                <strong>"Removed Tag Label"</strong> field when
                                using <strong>"Special Tag"</strong> mode.
                              </p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>

                    <div className="flex items-center p-2 bg-slate-700 dark:bg-slate-700 rounded-md border border-slate-700 dark:border-slate-700">
                      <Tag className="h-4 w-4 mr-2 text-white dark:text-white" />
                      <code className="text-sm font-mono text-white dark:text-white">
                        {form.watch('removedTagPrefix') || 'pulsarr:removed'}
                      </code>
                    </div>
                  </div>
                )}

                <h3 className="font-medium text-sm text-foreground mt-4 mb-2">
                  Configuration
                </h3>
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="deleteMovie"
                    render={({ field }) => (
                      <FormItem className="flex items-center space-x-2">
                        <FormControl>
                          <Switch
                            checked={
                              isSaving && submittedValues
                                ? submittedValues.deleteMovie
                                : field.value
                            }
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="flex items-center">
                          <FormLabel className="text-foreground m-0">
                            Delete Movies
                          </FormLabel>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">
                                  Remove movies from Radarr when no longer on
                                  any watchlist.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="deleteEndedShow"
                    render={({ field }) => (
                      <FormItem className="flex items-center space-x-2">
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="flex items-center">
                          <FormLabel className="text-foreground m-0">
                            Delete Ended Shows
                          </FormLabel>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">
                                  Remove TV shows with status "Ended" when no
                                  longer on any watchlist.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="deleteContinuingShow"
                    render={({ field }) => (
                      <FormItem className="flex items-center space-x-2">
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="flex items-center">
                          <FormLabel className="text-foreground m-0">
                            Delete Continuing Shows
                          </FormLabel>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">
                                  Remove TV shows with status "Continuing" when
                                  no longer on any watchlist.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="deleteFiles"
                    render={({ field }) => (
                      <FormItem className="flex items-center space-x-2">
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="flex items-center">
                          <FormLabel className="text-foreground m-0">
                            Delete Files
                          </FormLabel>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">
                                  Delete the actual media files when removing
                                  content, not just the tracking entry.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div>
                <h3 className="font-medium text-sm text-foreground mb-2">
                  Safety Settings
                </h3>
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="respectUserSyncSetting"
                    render={({ field }) => (
                      <FormItem className="flex items-center space-x-2">
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="flex items-center">
                          <FormLabel className="text-foreground m-0">
                            Respect User Sync Settings
                          </FormLabel>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">
                                  Only delete content for users who have syncing
                                  enabled in their profile settings.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="enablePlexPlaylistProtection"
                    render={({ field }) => (
                      <FormItem className="flex items-center space-x-2">
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="flex items-center">
                          <FormLabel className="text-foreground m-0">
                            Enable Plex Playlist Protection
                          </FormLabel>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">
                                  Prevent deletion of any content found in a
                                  designated Plex playlist. When enabled,
                                  running a dry run will create these playlists
                                  for all Plex users in the server.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="plexProtectionPlaylistName"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <div className="flex flex-col space-y-2">
                          <div className="flex items-center">
                            <FormLabel className="text-foreground m-0">
                              Protection Playlist Name
                            </FormLabel>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="max-w-xs">
                                    Name of the Plex playlist containing content
                                    that should never be deleted.
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <FormControl>
                            <Input
                              {...field}
                              value={
                                isSaving && submittedValues
                                  ? submittedValues.plexProtectionPlaylistName ||
                                    ''
                                  : field.value || ''
                              }
                              className="w-full"
                              placeholder="Do Not Delete"
                              disabled={
                                isSaving ||
                                !form.watch('enablePlexPlaylistProtection')
                              }
                            />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="deleteSyncNotify"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <div className="flex flex-col space-y-2">
                          <div className="flex items-center">
                            <FormLabel className="text-foreground m-0">
                              Notifications
                            </FormLabel>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <div className="max-w-xs">
                                    <p>
                                      Controls how deletion notifications are
                                      sent:
                                    </p>
                                    <ul className="list-disc pl-4 text-sm mt-1">
                                      <li>
                                        All Channels: Send to all notification
                                        methods
                                      </li>
                                      <li>Apprise Only: Only use Apprise</li>
                                      <li>
                                        Discord (Webhook + DM): Send to both
                                        Discord webhook and DMs
                                      </li>
                                      <li>
                                        Discord (DM Only): Send only to Discord
                                        DMs
                                      </li>
                                      <li>
                                        Discord (Webhook Only): Send only to
                                        Discord webhook
                                      </li>
                                      <li>None: No notifications</li>
                                    </ul>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <Select
                            onValueChange={field.onChange}
                            value={
                              isSaving && submittedValues
                                ? submittedValues.deleteSyncNotify
                                : field.value
                            }
                            disabled={isSaving}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select notification type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="all">All Channels</SelectItem>
                              <SelectItem value="apprise-only">
                                Apprise Only
                              </SelectItem>
                              <SelectItem value="discord-both">
                                Discord (Webhook + DM)
                              </SelectItem>
                              <SelectItem value="dm-only">
                                Discord (DM Only)
                              </SelectItem>
                              <SelectItem value="webhook-only">
                                Discord (Webhook Only)
                              </SelectItem>
                              <SelectItem value="none">None</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="deleteSyncNotifyOnlyOnDeletion"
                    render={({ field }) => (
                      <FormItem className="flex items-center space-x-2">
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={
                              isSaving ||
                              form.watch('deleteSyncNotify') === 'none'
                            }
                          />
                        </FormControl>
                        <div className="flex items-center">
                          <FormLabel className="text-foreground m-0">
                            Only Notify When Items Deleted
                          </FormLabel>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">
                                  When enabled, notifications will only be sent
                                  when items are actually deleted. No
                                  notification will be sent for "0 items
                                  deleted" scenarios.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="maxDeletionPrevention"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <div className="flex flex-col space-y-2">
                          <div className="flex items-center">
                            <FormLabel className="text-foreground m-0">
                              Max Deletion Prevention (%)
                            </FormLabel>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="max-w-xs">
                                    Safety threshold (%) to prevent mass
                                    deletions. Operation will abort if
                                    percentage exceeds this value.
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={100}
                              {...field}
                              value={
                                isSaving && submittedValues
                                  ? submittedValues.maxDeletionPrevention || ''
                                  : field.value || ''
                              }
                              className="w-20 text-center"
                              placeholder="10"
                              disabled={isSaving}
                            />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>

            {/* Action buttons - always show, but disable save when not dirty */}
            <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
              {form.formState.isDirty && !isSaving && (
                <Button
                  type="button"
                  variant="cancel"
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="flex items-center gap-1"
                >
                  <X className="h-4 w-4" />
                  <span>Cancel</span>
                </Button>
              )}

              <Button
                type="submit"
                disabled={isSaving || !form.formState.isDirty}
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

        {dryRunError && (
          <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-xs border border-red-300 dark:border-red-700">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2" />
              <span>{dryRunError}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

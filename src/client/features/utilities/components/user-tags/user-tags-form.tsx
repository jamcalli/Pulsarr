import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  Tag,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Save,
  X,
  HelpCircle,
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
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  useUserTags,
  isCreateTagResponse,
  isSyncTagResponse,
  isCleanupTagResponse,
} from '@/features/utilities/hooks/useUserTags'
import { useMediaQuery } from '@/hooks/use-media-query'
import { Progress } from '@/components/ui/progress'
import { useProgressStore } from '@/stores/progressStore'
import { UserTagsDeleteConfirmationModal } from '@/features/utilities/components/user-tags/user-tags-delete-confirmation-modal'
import { useTaggingProgress } from '@/features/utilities/hooks/useTaggingProgress'

/**
 * Displays a comprehensive form for configuring and managing user-based tagging for Sonarr and Radarr content.
 *
 * Provides controls to enable or disable tagging in Sonarr and Radarr, set tag prefix, clean up orphaned tags, and persist historical tags. Includes actions to create, synchronize, clean up, and remove user tags, with real-time progress feedback, operation results, and error handling.
 *
 * @returns A React element representing the user tag management interface.
 */
export function UserTagsForm() {
  const isMobile = useMediaQuery('(max-width: 768px)')

  const {
    form,
    isSaving,
    isCreatingTags,
    isSyncingTags,
    isCleaningTags,
    isRemovingTags,
    error,
    lastResults,
    lastActionResults,
    lastRemoveResults,
    showDeleteConfirmation,
    setShowDeleteConfirmation,
    onSubmit,
    handleCancel,
    handleCreateTags,
    handleSyncTags,
    handleCleanupTags,
    initiateRemoveTags,
    handleRemoveTags,
  } = useUserTags()

  // Use the custom hook for each progress type
  const sonarrTaggingProgress = useTaggingProgress('sonarr-tagging')
  const radarrTaggingProgress = useTaggingProgress('radarr-tagging')
  const sonarrRemovalProgress = useTaggingProgress('sonarr-tag-removal')
  const radarrRemovalProgress = useTaggingProgress('radarr-tag-removal')

  // Initialize progress connection
  useEffect(() => {
    const progressStore = useProgressStore.getState()
    progressStore.initialize()
    return () => {
      progressStore.cleanup()
    }
  }, [])

  // Determine the enabled status badge
  const isEnabled =
    form.watch('tagUsersInSonarr') || form.watch('tagUsersInRadarr')

  // Determine if the tag prefix can be edited
  const canEditTagPrefix =
    isRemovingTags ||
    !lastResults?.success ||
    (lastRemoveResults &&
      (lastRemoveResults.sonarr.tagsDeleted > 0 ||
        lastRemoveResults.radarr.tagsDeleted > 0))

  return (
    <>
      <UserTagsDeleteConfirmationModal
        open={showDeleteConfirmation}
        onOpenChange={setShowDeleteConfirmation}
        onConfirm={handleRemoveTags}
        isSubmitting={isRemovingTags}
      />

      <Accordion type="single" collapsible className="w-full">
        <AccordionItem
          value="user-tags"
          className="border-2 border-border rounded-base overflow-hidden"
        >
          <AccordionTrigger className="px-6 py-4 bg-main hover:bg-main hover:no-underline">
            <div className="flex justify-between items-center w-full pr-2">
              <div>
                <h3 className="text-lg font-medium text-text text-left">
                  User Tags
                </h3>
                <p className="text-sm text-text text-left">
                  Configure user-based tagging for Sonarr and Radarr content
                </p>
              </div>
              <Badge
                variant="neutral"
                className={cn(
                  'px-2 py-0.5 h-7 text-sm ml-2 mr-2',
                  isEnabled
                    ? 'bg-green-500 hover:bg-green-500 text-white'
                    : 'bg-red-500 hover:bg-red-500 text-white',
                )}
              >
                {isEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="p-0">
            <div className="p-6 border-t border-border">
              <div className="space-y-6">
                {/* Actions section */}
                <div>
                  <h3 className="font-medium text-text mb-2">Actions</h3>
                  <div className="flex flex-wrap items-center gap-4">
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleCreateTags}
                      disabled={
                        isCreatingTags ||
                        !(
                          lastResults?.config?.tagUsersInSonarr ||
                          lastResults?.config?.tagUsersInRadarr
                        )
                      }
                      variant="noShadow"
                      className="h-8"
                    >
                      {isCreatingTags ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Tag className="h-4 w-4" />
                      )}
                      <span className={isMobile ? 'hidden' : 'ml-2'}>
                        Create Tags
                      </span>
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      onClick={handleSyncTags}
                      disabled={
                        isSyncingTags ||
                        !(
                          lastResults?.config?.tagUsersInSonarr ||
                          lastResults?.config?.tagUsersInRadarr
                        )
                      }
                      variant="noShadow"
                      className="h-8"
                    >
                      {isSyncingTags ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      <span className={isMobile ? 'hidden' : 'ml-2'}>
                        Sync Tags
                      </span>
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      onClick={handleCleanupTags}
                      disabled={
                        isCleaningTags ||
                        !lastResults?.config?.cleanupOrphanedTags
                      }
                      variant="noShadow"
                      className="h-8"
                    >
                      {isCleaningTags ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      <span className={isMobile ? 'hidden' : 'ml-2'}>
                        Clean Up
                      </span>
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      onClick={initiateRemoveTags}
                      disabled={
                        isRemovingTags ||
                        !(
                          lastResults?.config?.tagUsersInSonarr ||
                          lastResults?.config?.tagUsersInRadarr
                        )
                      }
                      variant="error"
                      className="h-8"
                    >
                      {isRemovingTags ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      <span className={isMobile ? 'hidden' : 'ml-2'}>
                        Remove Tags
                      </span>
                    </Button>
                  </div>

                  {/* Notify users when they have unsaved changes */}
                  {form.formState.isDirty && (
                    <div className="mt-2 text-sm text-amber-600 dark:text-amber-400">
                      You have unsaved changes. Please save your configuration
                      before performing tag operations.
                    </div>
                  )}
                </div>

                <Separator />

                {/* Status section - displays last action results if available */}
                {(lastActionResults ||
                  lastResults ||
                  lastRemoveResults ||
                  isSyncingTags ||
                  isRemovingTags) && (
                  <div>
                    <h3 className="font-medium text-text mb-2">Status</h3>
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md">
                      {/* Display appropriate status message */}
                      {!(isSyncingTags || isRemovingTags) && (
                        <p className="text-sm text-text">
                          {lastRemoveResults?.message ||
                            lastActionResults?.message ||
                            lastResults?.message ||
                            'Configuration status'}
                        </p>
                      )}

                      {/* Progress bars for tagging operations */}
                      {isSyncingTags && (
                        <div className="mt-3 space-y-3">
                          {/* Overall progress message */}
                          <p className="text-sm text-text mb-2">
                            Synchronizing tags...
                          </p>

                          {/* Sonarr progress bar */}
                          {form.watch('tagUsersInSonarr') && (
                            <div className="mb-4">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-xs font-medium text-text">
                                  Sonarr
                                </span>
                                <span className="text-xs text-text">
                                  {sonarrTaggingProgress.progress}%
                                </span>
                              </div>
                              <Progress
                                value={sonarrTaggingProgress.progress}
                              />
                              {sonarrTaggingProgress.message && (
                                <p className="text-xs text-text mt-1">
                                  {sonarrTaggingProgress.message}
                                </p>
                              )}
                            </div>
                          )}

                          {/* Radarr progress bar */}
                          {form.watch('tagUsersInRadarr') && (
                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-xs font-medium text-text">
                                  Radarr
                                </span>
                                <span className="text-xs text-text">
                                  {radarrTaggingProgress.progress}%
                                </span>
                              </div>
                              <Progress
                                value={radarrTaggingProgress.progress}
                              />
                              {radarrTaggingProgress.message && (
                                <p className="text-xs text-text mt-1">
                                  {radarrTaggingProgress.message}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Progress bars for removal operations */}
                      {isRemovingTags && (
                        <div className="mt-3 space-y-3">
                          {/* Overall progress message */}
                          <p className="text-sm text-text mb-2">
                            Removing tags...
                          </p>

                          {/* Sonarr progress bar */}
                          {form.watch('tagUsersInSonarr') && (
                            <div className="mb-4">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-xs font-medium text-text">
                                  Sonarr
                                </span>
                                <span className="text-xs text-text">
                                  {sonarrRemovalProgress.progress}%
                                </span>
                              </div>
                              <Progress
                                value={sonarrRemovalProgress.progress}
                              />
                              {sonarrRemovalProgress.message && (
                                <p className="text-xs text-text mt-1">
                                  {sonarrRemovalProgress.message}
                                </p>
                              )}
                            </div>
                          )}

                          {/* Radarr progress bar */}
                          {form.watch('tagUsersInRadarr') && (
                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-xs font-medium text-text">
                                  Radarr
                                </span>
                                <span className="text-xs text-text">
                                  {radarrRemovalProgress.progress}%
                                </span>
                              </div>
                              <Progress
                                value={radarrRemovalProgress.progress}
                              />
                              {radarrRemovalProgress.message && (
                                <p className="text-xs text-text mt-1">
                                  {radarrRemovalProgress.message}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {lastActionResults &&
                        !isSyncingTags &&
                        !isRemovingTags && (
                          <>
                            <h4 className="font-medium text-sm text-text mt-3 mb-1">
                              Last Operation Results
                            </h4>

                            {/* Sonarr results */}
                            {lastActionResults?.sonarr && (
                              <div className="mt-2">
                                <h5 className="text-xs font-medium text-text">
                                  Sonarr
                                </h5>
                                <ul className="mt-1 space-y-1">
                                  <li className="text-xs text-text">
                                    {isCreateTagResponse(lastActionResults) && (
                                      <>
                                        Created:{' '}
                                        {lastActionResults.sonarr.created},
                                        Skipped:{' '}
                                        {lastActionResults.sonarr.skipped},
                                        Failed:{' '}
                                        {lastActionResults.sonarr.failed},
                                        Instances:{' '}
                                        {lastActionResults.sonarr.instances}
                                      </>
                                    )}
                                    {isSyncTagResponse(lastActionResults) && (
                                      <>
                                        Tagged:{' '}
                                        {lastActionResults.sonarr.tagged},
                                        Skipped:{' '}
                                        {lastActionResults.sonarr.skipped},
                                        Failed:{' '}
                                        {lastActionResults.sonarr.failed}
                                      </>
                                    )}
                                    {isCleanupTagResponse(
                                      lastActionResults,
                                    ) && (
                                      <>
                                        Removed:{' '}
                                        {lastActionResults.sonarr.removed},
                                        Skipped:{' '}
                                        {lastActionResults.sonarr.skipped},
                                        Failed:{' '}
                                        {lastActionResults.sonarr.failed},
                                        Instances:{' '}
                                        {lastActionResults.sonarr.instances}
                                      </>
                                    )}
                                  </li>
                                </ul>
                              </div>
                            )}

                            {/* Radarr results */}
                            {lastActionResults?.radarr && (
                              <div className="mt-2">
                                <h5 className="text-xs font-medium text-text">
                                  Radarr
                                </h5>
                                <ul className="mt-1 space-y-1">
                                  <li className="text-xs text-text">
                                    {isCreateTagResponse(lastActionResults) && (
                                      <>
                                        Created:{' '}
                                        {lastActionResults.radarr.created},
                                        Skipped:{' '}
                                        {lastActionResults.radarr.skipped},
                                        Failed:{' '}
                                        {lastActionResults.radarr.failed},
                                        Instances:{' '}
                                        {lastActionResults.radarr.instances}
                                      </>
                                    )}
                                    {isSyncTagResponse(lastActionResults) && (
                                      <>
                                        Tagged:{' '}
                                        {lastActionResults.radarr.tagged},
                                        Skipped:{' '}
                                        {lastActionResults.radarr.skipped},
                                        Failed:{' '}
                                        {lastActionResults.radarr.failed}
                                      </>
                                    )}
                                    {isCleanupTagResponse(
                                      lastActionResults,
                                    ) && (
                                      <>
                                        Removed:{' '}
                                        {lastActionResults.radarr.removed},
                                        Skipped:{' '}
                                        {lastActionResults.radarr.skipped},
                                        Failed:{' '}
                                        {lastActionResults.radarr.failed},
                                        Instances:{' '}
                                        {lastActionResults.radarr.instances}
                                      </>
                                    )}
                                  </li>
                                </ul>
                              </div>
                            )}

                            {/* Orphaned cleanup if available */}
                            {isSyncTagResponse(lastActionResults) &&
                              lastActionResults.orphanedCleanup && (
                                <div className="mt-2">
                                  <h5 className="text-xs font-medium text-text">
                                    Orphaned Cleanup
                                  </h5>
                                  <ul className="mt-1 space-y-1">
                                    <li className="text-xs text-text">
                                      Sonarr:{' '}
                                      {
                                        lastActionResults.orphanedCleanup.sonarr
                                          .removed
                                      }{' '}
                                      removed,{' '}
                                      {
                                        lastActionResults.orphanedCleanup.sonarr
                                          .skipped
                                      }{' '}
                                      skipped
                                    </li>
                                    <li className="text-xs text-text">
                                      Radarr:{' '}
                                      {
                                        lastActionResults.orphanedCleanup.radarr
                                          .removed
                                      }{' '}
                                      removed,{' '}
                                      {
                                        lastActionResults.orphanedCleanup.radarr
                                          .skipped
                                      }{' '}
                                      skipped
                                    </li>
                                  </ul>
                                </div>
                              )}
                          </>
                        )}

                      {/* Tag removal results */}
                      {lastRemoveResults && !isRemovingTags && (
                        <>
                          <h4 className="font-medium text-sm text-text mt-3 mb-1">
                            Tag Removal Results
                          </h4>

                          {/* Sonarr removal results */}
                          <div className="mt-2">
                            <h5 className="text-xs font-medium text-text">
                              Sonarr
                            </h5>
                            <ul className="mt-1 space-y-1">
                              <li className="text-xs text-text">
                                Items Updated:{' '}
                                {lastRemoveResults.sonarr.itemsUpdated}, Tags
                                Removed: {lastRemoveResults.sonarr.tagsRemoved},
                                Tags Deleted:{' '}
                                {lastRemoveResults.sonarr.tagsDeleted},
                                Instances: {lastRemoveResults.sonarr.instances}
                              </li>
                            </ul>
                          </div>

                          {/* Radarr removal results */}
                          <div className="mt-2">
                            <h5 className="text-xs font-medium text-text">
                              Radarr
                            </h5>
                            <ul className="mt-1 space-y-1">
                              <li className="text-xs text-text">
                                Items Updated:{' '}
                                {lastRemoveResults.radarr.itemsUpdated}, Tags
                                Removed: {lastRemoveResults.radarr.tagsRemoved},
                                Tags Deleted:{' '}
                                {lastRemoveResults.radarr.tagsDeleted},
                                Instances: {lastRemoveResults.radarr.instances}
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
                    <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
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

                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-4"
                  >
                    <div>
                      <h3 className="font-medium text-sm text-text mb-2">
                        Tag Configuration
                      </h3>
                      <div className="space-y-4">
                        <FormField
                          control={form.control}
                          name="tagUsersInSonarr"
                          render={({ field }) => (
                            <FormItem className="flex items-center space-x-2">
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                              <div className="flex items-center">
                                <FormLabel className="text-text m-0">
                                  Tag Users in Sonarr
                                </FormLabel>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <HelpCircle className="h-4 w-4 ml-2 text-text cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="max-w-xs">
                                        Automatically adds user-specific tags to
                                        TV shows in Sonarr based on who added
                                        them to their watchlist. Helps track
                                        which users requested which content.
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
                          name="tagUsersInRadarr"
                          render={({ field }) => (
                            <FormItem className="flex items-center space-x-2">
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                              <div className="flex items-center">
                                <FormLabel className="text-text m-0">
                                  Tag Users in Radarr
                                </FormLabel>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <HelpCircle className="h-4 w-4 ml-2 text-text cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="max-w-xs">
                                        Automatically adds user-specific tags to
                                        movies in Radarr based on who added them
                                        to their watchlist. Helps track which
                                        users requested which content.
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
                          name="cleanupOrphanedTags"
                          render={({ field }) => (
                            <FormItem className="flex items-center space-x-2">
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                              <div className="flex items-center">
                                <FormLabel className="text-text m-0">
                                  Clean Up Orphaned Tags
                                </FormLabel>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <HelpCircle className="h-4 w-4 ml-2 text-text cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="max-w-xs">
                                        Removes tags that no longer correspond
                                        to active users. Prevents accumulation
                                        of unused tags when users are deleted or
                                        renamed.
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
                          name="persistHistoricalTags"
                          render={({ field }) => (
                            <FormItem className="flex items-center space-x-2">
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                              <div className="flex items-center">
                                <FormLabel className="text-text m-0">
                                  Persist Historical Tags
                                </FormLabel>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <HelpCircle className="h-4 w-4 ml-2 text-text cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="max-w-xs">
                                        Maintains user tags even after content
                                        is removed from a user's watchlist.
                                        Preserves historical record of who
                                        originally requested content.
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
                          name="tagPrefix"
                          render={({ field }) => (
                            <FormItem>
                              <div className="flex items-center">
                                <FormLabel className="text-text">
                                  Tag Prefix
                                </FormLabel>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <HelpCircle className="h-4 w-4 ml-2 text-text cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="max-w-xs">
                                        Defines the prefix used for all user
                                        tags (e.g., 'pulsarr:user:username').
                                        Helps identify Pulsarr-managed tags and
                                        keeps them organized separately from
                                        other tags in Sonarr/Radarr. Note:
                                        Changing this requires removing existing
                                        tags first, as old tags won't be
                                        recognized with the new prefix.
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="pulsarr:user"
                                  disabled={!canEditTagPrefix}
                                />
                              </FormControl>
                              {lastResults?.success &&
                                lastResults.config?.tagUsersInSonarr &&
                                !canEditTagPrefix && (
                                  <p className="text-xs text-gray-500 mt-1">
                                    You must remove existing tags with "Delete
                                    Tag Definitions" enabled before changing the
                                    prefix.
                                  </p>
                                )}
                              <FormMessage />
                            </FormItem>
                          )}
                        />
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
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </>
  )
}

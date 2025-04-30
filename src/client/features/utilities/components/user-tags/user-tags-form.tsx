import { useEffect, useState } from 'react'
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
  useUserTags,
  isCreateTagResponse,
  isSyncTagResponse,
  isCleanupTagResponse,
  isRemoveTagsResponse,
} from '@/features/utilities/hooks/useUserTags'
import { useMediaQuery } from '@/hooks/use-media-query'
import { Progress } from '@/components/ui/progress'
import { useProgressStore } from '@/stores/progressStore'
import { UserTagsDeleteConfirmationModal } from '@/features/utilities/components/user-tags/user-tags-delete-confirmation-modal'

/**
 * Renders the UserTagsForm component that provides an interface for managing user tagging.
 *
 * This component displays the current tagging configuration and provides actions to create tags,
 * synchronize content with tags, clean up orphaned tags, and remove all user tags. It presents a form for configuring
 * tag settings, such as which Arr instances to tag in, whether to clean up orphaned tags, and
 * the tag prefix to use.
 *
 * @returns A React element representing the user tagging management form.
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

  // Improved progress state with separate messages
  const [syncProgress, setSyncProgress] = useState({
    sonarr: {
      progress: 0,
      message: '',
    },
    radarr: {
      progress: 0,
      message: '',
    },
    overall: {
      progress: 0,
      message: '',
    },
  })

  const [removeProgress, setRemoveProgress] = useState({
    sonarr: {
      progress: 0,
      message: '',
    },
    radarr: {
      progress: 0,
      message: '',
    },
    overall: {
      progress: 0,
      message: '',
    },
  })

  // Debug helper - uncomment to see progress events in console
  /*
  useEffect(() => {
    const unsubscribeTagging = useProgressStore.getState().subscribeToType(
      'tagging',
      (event) => {
        console.log('Tagging progress event received:', event)
      }
    )
    
    const unsubscribeRemoval = useProgressStore.getState().subscribeToType(
      'tag-removal',
      (event) => {
        console.log('Tag removal progress event received:', event)
      }
    )
    
    return () => {
      unsubscribeTagging()
      unsubscribeRemoval()
    }
  }, [])
  */

  // Subscribe to progress updates for tagging operations with improved handling
  useEffect(() => {
    const unsubscribe = useProgressStore
      .getState()
      .subscribeToType('tagging', (event) => {
        if (event.progress !== undefined) {
          setSyncProgress((prev) => {
            const newState = { ...prev }

            // Update overall message and progress by default
            if (event.message) {
              newState.overall = {
                ...newState.overall,
                message: event.message,
                progress: event.progress,
              }
            }

            // Update Sonarr progress and message
            if (event.phase?.toLowerCase().includes('sonarr')) {
              newState.sonarr = {
                ...newState.sonarr,
                progress: event.progress,
                message: event.message || newState.sonarr.message,
              }
            }

            // Update Radarr progress and message
            else if (event.phase?.toLowerCase().includes('radarr')) {
              newState.radarr = {
                ...newState.radarr,
                progress: event.progress,
                message: event.message || newState.radarr.message,
              }
            }
            // If there's no specific phase but there is progress, update both
            else if (event.progress) {
              // For general progress updates without specific service
              if (
                !event.phase?.toLowerCase().includes('sonarr') &&
                !event.phase?.toLowerCase().includes('radarr')
              ) {
                newState.sonarr.progress = event.progress
                newState.radarr.progress = event.progress
              }
            }

            return newState
          })
        }
      })
    return unsubscribe
  }, [])

  // Subscribe to progress updates for tag removal operations with improved handling
  useEffect(() => {
    const unsubscribe = useProgressStore
      .getState()
      .subscribeToType('tag-removal', (event) => {
        if (event.progress !== undefined) {
          setRemoveProgress((prev) => {
            const newState = { ...prev }

            // Update overall message and progress by default
            if (event.message) {
              newState.overall = {
                ...newState.overall,
                message: event.message,
                progress: event.progress,
              }
            }

            // Update Sonarr progress and message
            if (event.phase?.toLowerCase().includes('sonarr')) {
              newState.sonarr = {
                ...newState.sonarr,
                progress: event.progress,
                message: event.message || newState.sonarr.message,
              }
            }

            // Update Radarr progress and message
            else if (event.phase?.toLowerCase().includes('radarr')) {
              newState.radarr = {
                ...newState.radarr,
                progress: event.progress,
                message: event.message || newState.radarr.message,
              }
            }
            // If there's no specific phase but there is progress, update both
            else if (event.progress) {
              // For general progress updates without specific service
              if (
                !event.phase?.toLowerCase().includes('sonarr') &&
                !event.phase?.toLowerCase().includes('radarr')
              ) {
                newState.sonarr.progress = event.progress
                newState.radarr.progress = event.progress
              }
            }

            return newState
          })
        }
      })
    return unsubscribe
  }, [])

  // Determine the enabled status badge
  const isEnabled =
    form.watch('tagUsersInSonarr') || form.watch('tagUsersInRadarr')

  // Initialize progress connection
  useEffect(() => {
    const progressStore = useProgressStore.getState()
    progressStore.initialize()
    return () => {
      progressStore.cleanup()
    }
  }, [])

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
                      disabled={isCreatingTags || !isEnabled}
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
                      disabled={isSyncingTags || !isEnabled}
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
                        isCleaningTags || !form.watch('cleanupOrphanedTags')
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
                      disabled={isRemovingTags || !isEnabled}
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
                          <p className="text-sm text-text">
                            {syncProgress.overall.message ||
                              'Synchronizing tags...'}
                          </p>

                          {/* Sonarr progress bar */}
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-xs font-medium text-text">
                                Sonarr
                              </span>
                              <span className="text-xs text-text">
                                {syncProgress.sonarr.progress}%
                              </span>
                            </div>
                            <Progress value={syncProgress.sonarr.progress} />
                            {syncProgress.sonarr.message && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {syncProgress.sonarr.message}
                              </p>
                            )}
                          </div>

                          {/* Radarr progress bar */}
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-xs font-medium text-text">
                                Radarr
                              </span>
                              <span className="text-xs text-text">
                                {syncProgress.radarr.progress}%
                              </span>
                            </div>
                            <Progress value={syncProgress.radarr.progress} />
                            {syncProgress.radarr.message && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {syncProgress.radarr.message}
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Progress bars for removal operations */}
                      {isRemovingTags && (
                        <div className="mt-3 space-y-3">
                          {/* Overall progress message */}
                          <p className="text-sm text-text">
                            {removeProgress.overall.message ||
                              'Removing tags...'}
                          </p>

                          {/* Sonarr progress bar */}
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-xs font-medium text-text">
                                Sonarr
                              </span>
                              <span className="text-xs text-text">
                                {removeProgress.sonarr.progress}%
                              </span>
                            </div>
                            <Progress value={removeProgress.sonarr.progress} />
                            {removeProgress.sonarr.message && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {removeProgress.sonarr.message}
                              </p>
                            )}
                          </div>

                          {/* Radarr progress bar */}
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-xs font-medium text-text">
                                Radarr
                              </span>
                              <span className="text-xs text-text">
                                {removeProgress.radarr.progress}%
                              </span>
                            </div>
                            <Progress value={removeProgress.radarr.progress} />
                            {removeProgress.radarr.message && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {removeProgress.radarr.message}
                              </p>
                            )}
                          </div>
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
                                <ul className="mt-1 space-y-1 text-xs">
                                  {isCreateTagResponse(lastActionResults) && (
                                    <li>
                                      <span className="text-text">
                                        Created:{' '}
                                        {lastActionResults.sonarr.created},
                                        Skipped:{' '}
                                        {lastActionResults.sonarr.skipped},
                                        Failed:{' '}
                                        {lastActionResults.sonarr.failed},
                                        Instances:{' '}
                                        {lastActionResults.sonarr.instances}
                                      </span>
                                    </li>
                                  )}
                                  {isSyncTagResponse(lastActionResults) && (
                                    <li>
                                      <span className="text-text">
                                        Tagged:{' '}
                                        {lastActionResults.sonarr.tagged},
                                        Skipped:{' '}
                                        {lastActionResults.sonarr.skipped},
                                        Failed:{' '}
                                        {lastActionResults.sonarr.failed}
                                      </span>
                                    </li>
                                  )}
                                  {isCleanupTagResponse(lastActionResults) && (
                                    <li>
                                      <span className="text-text">
                                        Removed:{' '}
                                        {lastActionResults.sonarr.removed},
                                        Skipped:{' '}
                                        {lastActionResults.sonarr.skipped},
                                        Failed:{' '}
                                        {lastActionResults.sonarr.failed},
                                        Instances:{' '}
                                        {lastActionResults.sonarr.instances}
                                      </span>
                                    </li>
                                  )}
                                </ul>
                              </div>
                            )}

                            {/* Radarr results */}
                            {lastActionResults?.radarr && (
                              <div className="mt-2">
                                <h5 className="text-xs font-medium text-text">
                                  Radarr
                                </h5>
                                <ul className="mt-1 space-y-1 text-xs">
                                  {isCreateTagResponse(lastActionResults) && (
                                    <li>
                                      <span className="text-text">
                                        Created:{' '}
                                        {lastActionResults.radarr.created},
                                        Skipped:{' '}
                                        {lastActionResults.radarr.skipped},
                                        Failed:{' '}
                                        {lastActionResults.radarr.failed},
                                        Instances:{' '}
                                        {lastActionResults.radarr.instances}
                                      </span>
                                    </li>
                                  )}
                                  {isSyncTagResponse(lastActionResults) && (
                                    <li>
                                      <span className="text-text">
                                        Tagged:{' '}
                                        {lastActionResults.radarr.tagged},
                                        Skipped:{' '}
                                        {lastActionResults.radarr.skipped},
                                        Failed:{' '}
                                        {lastActionResults.radarr.failed}
                                      </span>
                                    </li>
                                  )}
                                  {isCleanupTagResponse(lastActionResults) && (
                                    <li>
                                      <span className="text-text">
                                        Removed:{' '}
                                        {lastActionResults.radarr.removed},
                                        Skipped:{' '}
                                        {lastActionResults.radarr.skipped},
                                        Failed:{' '}
                                        {lastActionResults.radarr.failed},
                                        Instances:{' '}
                                        {lastActionResults.radarr.instances}
                                      </span>
                                    </li>
                                  )}
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
                                  <ul className="mt-1 space-y-1 text-xs">
                                    <li>
                                      <span className="text-text">
                                        Sonarr:{' '}
                                        {
                                          lastActionResults.orphanedCleanup
                                            .sonarr.removed
                                        }{' '}
                                        removed,{' '}
                                        {
                                          lastActionResults.orphanedCleanup
                                            .sonarr.skipped
                                        }{' '}
                                        skipped
                                      </span>
                                    </li>
                                    <li>
                                      <span className="text-text">
                                        Radarr:{' '}
                                        {
                                          lastActionResults.orphanedCleanup
                                            .radarr.removed
                                        }{' '}
                                        removed,{' '}
                                        {
                                          lastActionResults.orphanedCleanup
                                            .radarr.skipped
                                        }{' '}
                                        skipped
                                      </span>
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
                            <ul className="mt-1 space-y-1 text-xs">
                              <li>
                                <span className="text-text">
                                  Items Updated:{' '}
                                  {lastRemoveResults.sonarr.itemsUpdated}, Tags
                                  Removed:{' '}
                                  {lastRemoveResults.sonarr.tagsRemoved}, Tags
                                  Deleted:{' '}
                                  {lastRemoveResults.sonarr.tagsDeleted},
                                  Instances:{' '}
                                  {lastRemoveResults.sonarr.instances}
                                </span>
                              </li>
                            </ul>
                          </div>

                          {/* Radarr removal results */}
                          <div className="mt-2">
                            <h5 className="text-xs font-medium text-text">
                              Radarr
                            </h5>
                            <ul className="mt-1 space-y-1 text-xs">
                              <li>
                                <span className="text-text">
                                  Items Updated:{' '}
                                  {lastRemoveResults.radarr.itemsUpdated}, Tags
                                  Removed:{' '}
                                  {lastRemoveResults.radarr.tagsRemoved}, Tags
                                  Deleted:{' '}
                                  {lastRemoveResults.radarr.tagsDeleted},
                                  Instances:{' '}
                                  {lastRemoveResults.radarr.instances}
                                </span>
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
                              <FormLabel className="text-text m-0">
                                Tag Users in Sonarr
                              </FormLabel>
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
                              <FormLabel className="text-text m-0">
                                Tag Users in Radarr
                              </FormLabel>
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
                              <FormLabel className="text-text m-0">
                                Clean Up Orphaned Tags
                              </FormLabel>
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
                              <FormLabel className="text-text m-0">
                                Persist Historical Tags
                              </FormLabel>
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="tagPrefix"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-text">
                                Tag Prefix
                              </FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="pulsarr:user" />
                              </FormControl>
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

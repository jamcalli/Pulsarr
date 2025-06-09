import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Power, Save, X, Check, InfoIcon, Trash2 } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Separator } from '@/components/ui/separator'
import { useMediaQuery } from '@/hooks/use-media-query'
import {
  usePublicContentNotifications,
  type PublicContentNotificationsFormValues,
} from '@/features/utilities/hooks/usePublicContentNotifications'
import { PublicContentClearAlert } from '@/features/utilities/components/public-content-notifications/public-content-clear-alert'

/**
 * Form for configuring public content notifications that broadcast ALL content availability
 * to public Discord channels and shared Apprise endpoints for server-wide announcements.
 */
export function PublicContentNotificationsForm() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const {
    form,
    isSubmitting,
    isToggling,
    isClearing,
    testStatus,
    onSubmit,
    handleCancel,
    handleToggle,
    handleTestDiscordWebhook,
    handleClearField,
  } = usePublicContentNotifications()

  const [showClearAlert, setShowClearAlert] = React.useState(false)
  const [clearingField, setClearingField] = React.useState<string | null>(null)

  const isEnabled = form.watch('enabled')

  // Watch individual field values for clear button visibility
  const generalUrls = form.watch('discordWebhookUrls')
  const moviesUrls = form.watch('discordWebhookUrlsMovies')
  const showsUrls = form.watch('discordWebhookUrlsShows')
  const appriseGeneralUrls = form.watch('appriseUrls')
  const appriseMoviesUrls = form.watch('appriseUrlsMovies')
  const appriseShowsUrls = form.watch('appriseUrlsShows')

  // Test error states for red tooltips (same logic as notifications form)
  const generalFieldState = form.getFieldState('discordWebhookUrls')
  const moviesFieldState = form.getFieldState('discordWebhookUrlsMovies')
  const showsFieldState = form.getFieldState('discordWebhookUrlsShows')

  const showGeneralTestError =
    generalFieldState.isDirty &&
    !testStatus.testResults.general &&
    form.formState.isDirty

  const showMoviesTestError =
    moviesFieldState.isDirty &&
    !testStatus.testResults.movies &&
    form.formState.isDirty

  const showShowsTestError =
    showsFieldState.isDirty &&
    !testStatus.testResults.shows &&
    form.formState.isDirty

  // Check if form can be submitted (all dirty fields must have successful tests)
  const canSubmit =
    // General field: if dirty, must be tested successfully
    (!generalFieldState.isDirty || testStatus.testResults.general) &&
    // Movies field: if dirty, must be tested successfully
    (!moviesFieldState.isDirty || testStatus.testResults.movies) &&
    // Shows field: if dirty, must be tested successfully
    (!showsFieldState.isDirty || testStatus.testResults.shows)

  // Set manual validation errors only for dirty fields that need testing
  React.useEffect(() => {
    const values = form.getValues()

    if (
      generalFieldState.isDirty &&
      values.discordWebhookUrls &&
      !testStatus.testResults.general
    ) {
      form.setError('discordWebhookUrls', {
        type: 'manual',
        message: 'Please test connection before saving',
      })
    } else if (!generalFieldState.isDirty || testStatus.testResults.general) {
      form.clearErrors('discordWebhookUrls')
    }

    if (
      moviesFieldState.isDirty &&
      values.discordWebhookUrlsMovies &&
      !testStatus.testResults.movies
    ) {
      form.setError('discordWebhookUrlsMovies', {
        type: 'manual',
        message: 'Please test connection before saving',
      })
    } else if (!moviesFieldState.isDirty || testStatus.testResults.movies) {
      form.clearErrors('discordWebhookUrlsMovies')
    }

    if (
      showsFieldState.isDirty &&
      values.discordWebhookUrlsShows &&
      !testStatus.testResults.shows
    ) {
      form.setError('discordWebhookUrlsShows', {
        type: 'manual',
        message: 'Please test connection before saving',
      })
    } else if (!showsFieldState.isDirty || testStatus.testResults.shows) {
      form.clearErrors('discordWebhookUrlsShows')
    }
  }, [
    form,
    generalFieldState.isDirty,
    moviesFieldState.isDirty,
    showsFieldState.isDirty,
    testStatus.testResults.general,
    testStatus.testResults.movies,
    testStatus.testResults.shows,
  ])

  const toggleEnabled = async () => {
    const newEnabledState = !isEnabled

    try {
      await handleToggle(newEnabledState)
    } catch (error) {
      // Error handling is done in the hook
    }
  }

  return (
    <>
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem
          value="public-content-notifications"
          className="border-2 border-border rounded-base overflow-hidden"
        >
          <AccordionTrigger className="px-6 py-4 bg-main hover:bg-main hover:no-underline">
            <div className="flex justify-between items-center w-full pr-2">
              <div>
                <h3 className="text-lg font-medium text-black text-left">
                  Public Content Notifications
                </h3>
                <p className="text-sm text-black text-left">
                  Broadcast ALL content availability to public Discord channels
                  and shared Apprise endpoints
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
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-6"
                  >
                    {/* Actions section */}
                    <div>
                      <h3 className="font-medium text-text mb-2">Actions</h3>
                      <div className="flex flex-wrap items-center gap-4">
                        <Button
                          type="button"
                          size="sm"
                          onClick={toggleEnabled}
                          disabled={isSubmitting || isToggling || isClearing}
                          variant={isEnabled ? 'error' : 'noShadow'}
                          className="h-8"
                        >
                          {isToggling ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Power className="h-4 w-4" />
                          )}
                          <span className={isMobile ? 'hidden' : 'ml-2'}>
                            {isToggling
                              ? isEnabled
                                ? 'Disabling...'
                                : 'Enabling...'
                              : isEnabled
                                ? 'Disable'
                                : 'Enable'}
                          </span>
                        </Button>
                      </div>
                    </div>

                    <Separator />

                    {/* Information about public content notifications */}
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md">
                      <h3 className="font-medium text-text mb-2">
                        Public Content Broadcasting
                      </h3>
                      <p className="text-sm text-text">
                        {isEnabled ? (
                          <>
                            Public content notifications are enabled. ALL
                            content ready notifications will be broadcast to the
                            configured public endpoints in addition to
                            individual user notifications. Movies and shows can
                            be routed to specific endpoints, with fallback to
                            general endpoints if no specific ones are
                            configured. Discord notifications include @ mentions
                            for users who have the content watchlisted and have
                            configured Discord IDs.
                          </>
                        ) : (
                          <>
                            Content notifications will only be sent to
                            individual users based on their personal
                            notification settings. Enable this feature to
                            broadcast ALL content availability to public Discord
                            channels and shared Apprise endpoints for
                            server-wide announcements.
                          </>
                        )}
                      </p>
                    </div>

                    <Separator />

                    {/* Configuration form - only show when enabled */}
                    {isEnabled && (
                      <div className="space-y-6">
                        <div>
                          <h3 className="font-medium text-text mb-4">
                            Discord Webhook Configuration
                          </h3>
                          <div className="space-y-4">
                            <FormField
                              control={form.control}
                              name="discordWebhookUrls"
                              render={({ field }) => (
                                <FormItem>
                                  <div className="flex items-center gap-1">
                                    <FormLabel className="text-text">
                                      General Discord Webhook URLs
                                    </FormLabel>
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <InfoIcon className="h-4 w-4 text-text cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-xs">
                                          Discord webhook URLs for general
                                          content notifications. Multiple URLs
                                          can be separated by commas.
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </div>
                                  <FormControl>
                                    <div className="flex gap-2">
                                      <Input
                                        {...field}
                                        placeholder="https://discord.com/api/webhooks/..., https://discord.com/api/webhooks/..."
                                        disabled={
                                          testStatus.isTestingGeneral ||
                                          isSubmitting ||
                                          isToggling ||
                                          isClearing
                                        }
                                        className="w-full"
                                      />
                                      <TooltipProvider>
                                        <Tooltip
                                          open={
                                            showGeneralTestError || undefined
                                          }
                                        >
                                          <TooltipTrigger asChild>
                                            <Button
                                              type="button"
                                              onClick={() =>
                                                handleTestDiscordWebhook(
                                                  'general',
                                                )
                                              }
                                              disabled={
                                                testStatus.isTestingGeneral ||
                                                isSubmitting ||
                                                isToggling ||
                                                isClearing ||
                                                !field.value
                                              }
                                              size="icon"
                                              variant="noShadow"
                                              className="shrink-0"
                                            >
                                              {testStatus.isTestingGeneral ? (
                                                <Loader2 className="animate-spin" />
                                              ) : testStatus.testResults
                                                  .general ? (
                                                <Check className="text-black" />
                                              ) : (
                                                <Check />
                                              )}
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent
                                            className={
                                              showGeneralTestError
                                                ? 'bg-error text-black'
                                                : ''
                                            }
                                          >
                                            <p>Test connection</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>

                                      {generalUrls && (
                                        <Button
                                          type="button"
                                          variant="error"
                                          size="icon"
                                          onClick={() => {
                                            setClearingField(
                                              'discordWebhookUrls',
                                            )
                                            setShowClearAlert(true)
                                          }}
                                          disabled={
                                            testStatus.isTestingGeneral ||
                                            isSubmitting ||
                                            isToggling ||
                                            isClearing
                                          }
                                          className="shrink-0"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      )}
                                    </div>
                                  </FormControl>
                                  <p className="text-xs text-text opacity-70">
                                    Comma-separated list of Discord webhook URLs
                                    for general content notifications
                                  </p>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="discordWebhookUrlsMovies"
                              render={({ field }) => (
                                <FormItem>
                                  <div className="flex items-center gap-1">
                                    <FormLabel className="text-text">
                                      Movie-specific Discord Webhook URLs
                                    </FormLabel>
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <InfoIcon className="h-4 w-4 text-text cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-xs">
                                          Discord webhook URLs specifically for
                                          movie notifications. Multiple URLs can
                                          be separated by commas.
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </div>
                                  <FormControl>
                                    <div className="flex gap-2">
                                      <Input
                                        {...field}
                                        placeholder="https://discord.com/api/webhooks/..., https://discord.com/api/webhooks/..."
                                        disabled={
                                          testStatus.isTestingMovies ||
                                          isSubmitting ||
                                          isToggling ||
                                          isClearing
                                        }
                                        className="w-full"
                                      />
                                      <TooltipProvider>
                                        <Tooltip
                                          open={
                                            showMoviesTestError || undefined
                                          }
                                        >
                                          <TooltipTrigger asChild>
                                            <Button
                                              type="button"
                                              onClick={() =>
                                                handleTestDiscordWebhook(
                                                  'movies',
                                                )
                                              }
                                              disabled={
                                                testStatus.isTestingMovies ||
                                                isSubmitting ||
                                                isToggling ||
                                                isClearing ||
                                                !field.value
                                              }
                                              size="icon"
                                              variant="noShadow"
                                              className="shrink-0"
                                            >
                                              {testStatus.isTestingMovies ? (
                                                <Loader2 className="animate-spin" />
                                              ) : testStatus.testResults
                                                  .movies ? (
                                                <Check className="text-black" />
                                              ) : (
                                                <Check />
                                              )}
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent
                                            className={
                                              showMoviesTestError
                                                ? 'bg-error text-black'
                                                : ''
                                            }
                                          >
                                            <p>Test connection</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>

                                      {moviesUrls && (
                                        <Button
                                          type="button"
                                          variant="error"
                                          size="icon"
                                          onClick={() => {
                                            setClearingField(
                                              'discordWebhookUrlsMovies',
                                            )
                                            setShowClearAlert(true)
                                          }}
                                          disabled={
                                            testStatus.isTestingMovies ||
                                            isSubmitting ||
                                            isToggling ||
                                            isClearing
                                          }
                                          className="shrink-0"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      )}
                                    </div>
                                  </FormControl>
                                  <p className="text-xs text-text opacity-70">
                                    Comma-separated list of Discord webhook URLs
                                    specifically for movie notifications
                                  </p>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="discordWebhookUrlsShows"
                              render={({ field }) => (
                                <FormItem>
                                  <div className="flex items-center gap-1">
                                    <FormLabel className="text-text">
                                      Show-specific Discord Webhook URLs
                                    </FormLabel>
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <InfoIcon className="h-4 w-4 text-text cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-xs">
                                          Discord webhook URLs specifically for
                                          TV show notifications. Multiple URLs
                                          can be separated by commas.
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </div>
                                  <FormControl>
                                    <div className="flex gap-2">
                                      <Input
                                        {...field}
                                        placeholder="https://discord.com/api/webhooks/..., https://discord.com/api/webhooks/..."
                                        disabled={
                                          testStatus.isTestingShows ||
                                          isSubmitting ||
                                          isToggling ||
                                          isClearing
                                        }
                                        className="w-full"
                                      />
                                      <TooltipProvider>
                                        <Tooltip
                                          open={showShowsTestError || undefined}
                                        >
                                          <TooltipTrigger asChild>
                                            <Button
                                              type="button"
                                              onClick={() =>
                                                handleTestDiscordWebhook(
                                                  'shows',
                                                )
                                              }
                                              disabled={
                                                testStatus.isTestingShows ||
                                                isSubmitting ||
                                                isToggling ||
                                                isClearing ||
                                                !field.value
                                              }
                                              size="icon"
                                              variant="noShadow"
                                              className="shrink-0"
                                            >
                                              {testStatus.isTestingShows ? (
                                                <Loader2 className="animate-spin" />
                                              ) : testStatus.testResults
                                                  .shows ? (
                                                <Check className="text-black" />
                                              ) : (
                                                <Check />
                                              )}
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent
                                            className={
                                              showShowsTestError
                                                ? 'bg-error text-black'
                                                : ''
                                            }
                                          >
                                            <p>Test connection</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>

                                      {showsUrls && (
                                        <Button
                                          type="button"
                                          variant="error"
                                          size="icon"
                                          onClick={() => {
                                            setClearingField(
                                              'discordWebhookUrlsShows',
                                            )
                                            setShowClearAlert(true)
                                          }}
                                          disabled={
                                            testStatus.isTestingShows ||
                                            isSubmitting ||
                                            isToggling ||
                                            isClearing
                                          }
                                          className="shrink-0"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      )}
                                    </div>
                                  </FormControl>
                                  <p className="text-xs text-text opacity-70">
                                    Comma-separated list of Discord webhook URLs
                                    specifically for TV show notifications
                                  </p>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>

                        <Separator />

                        <div>
                          <h3 className="font-medium text-text mb-4">
                            Apprise Configuration
                          </h3>
                          <div className="space-y-4">
                            <FormField
                              control={form.control}
                              name="appriseUrls"
                              render={({ field }) => (
                                <FormItem>
                                  <div className="flex items-center gap-1">
                                    <FormLabel className="text-text">
                                      General Apprise URLs
                                    </FormLabel>
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <InfoIcon className="h-4 w-4 text-text cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-xs">
                                          Apprise URLs for general content
                                          notifications. Multiple URLs can be
                                          separated by commas.
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </div>
                                  <FormControl>
                                    <div className="flex gap-2">
                                      <Input
                                        {...field}
                                        placeholder="discord://webhook_id/token, mailto://user:pass@gmail.com"
                                        disabled={
                                          isSubmitting ||
                                          isToggling ||
                                          isClearing
                                        }
                                        className="w-full"
                                      />

                                      {appriseGeneralUrls && (
                                        <Button
                                          type="button"
                                          variant="error"
                                          size="icon"
                                          onClick={() => {
                                            setClearingField('appriseUrls')
                                            setShowClearAlert(true)
                                          }}
                                          disabled={
                                            isSubmitting ||
                                            isToggling ||
                                            isClearing
                                          }
                                          className="shrink-0"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      )}
                                    </div>
                                  </FormControl>
                                  <p className="text-xs text-text opacity-70">
                                    Comma-separated list of Apprise URLs for
                                    general content notifications
                                  </p>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="appriseUrlsMovies"
                              render={({ field }) => (
                                <FormItem>
                                  <div className="flex items-center gap-1">
                                    <FormLabel className="text-text">
                                      Movie-specific Apprise URLs
                                    </FormLabel>
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <InfoIcon className="h-4 w-4 text-text cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-xs">
                                          Apprise URLs specifically for movie
                                          notifications. Multiple URLs can be
                                          separated by commas.
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </div>
                                  <FormControl>
                                    <div className="flex gap-2">
                                      <Input
                                        {...field}
                                        placeholder="discord://webhook_id/token, mailto://user:pass@gmail.com"
                                        disabled={
                                          isSubmitting ||
                                          isToggling ||
                                          isClearing
                                        }
                                        className="w-full"
                                      />

                                      {appriseMoviesUrls && (
                                        <Button
                                          type="button"
                                          variant="error"
                                          size="icon"
                                          onClick={() => {
                                            setClearingField(
                                              'appriseUrlsMovies',
                                            )
                                            setShowClearAlert(true)
                                          }}
                                          disabled={
                                            isSubmitting ||
                                            isToggling ||
                                            isClearing
                                          }
                                          className="shrink-0"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      )}
                                    </div>
                                  </FormControl>
                                  <p className="text-xs text-text opacity-70">
                                    Comma-separated list of Apprise URLs
                                    specifically for movie notifications
                                  </p>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="appriseUrlsShows"
                              render={({ field }) => (
                                <FormItem>
                                  <div className="flex items-center gap-1">
                                    <FormLabel className="text-text">
                                      Show-specific Apprise URLs
                                    </FormLabel>
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <InfoIcon className="h-4 w-4 text-text cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-xs">
                                          Apprise URLs specifically for TV show
                                          notifications. Multiple URLs can be
                                          separated by commas.
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </div>
                                  <FormControl>
                                    <div className="flex gap-2">
                                      <Input
                                        {...field}
                                        placeholder="discord://webhook_id/token, mailto://user:pass@gmail.com"
                                        disabled={
                                          isSubmitting ||
                                          isToggling ||
                                          isClearing
                                        }
                                        className="w-full"
                                      />

                                      {appriseShowsUrls && (
                                        <Button
                                          type="button"
                                          variant="error"
                                          size="icon"
                                          onClick={() => {
                                            setClearingField('appriseUrlsShows')
                                            setShowClearAlert(true)
                                          }}
                                          disabled={
                                            isSubmitting ||
                                            isToggling ||
                                            isClearing
                                          }
                                          className="shrink-0"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      )}
                                    </div>
                                  </FormControl>
                                  <p className="text-xs text-text opacity-70">
                                    Comma-separated list of Apprise URLs
                                    specifically for TV show notifications
                                  </p>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
                          {form.formState.isDirty &&
                            !isSubmitting &&
                            !isToggling &&
                            !isClearing && (
                              <Button
                                type="button"
                                variant="cancel"
                                onClick={handleCancel}
                                disabled={
                                  isSubmitting || isToggling || isClearing
                                }
                                className="flex items-center gap-1"
                              >
                                <X className="h-4 w-4" />
                                <span>Cancel</span>
                              </Button>
                            )}

                          <Button
                            type="submit"
                            disabled={
                              isSubmitting ||
                              isToggling ||
                              isClearing ||
                              !form.formState.isDirty ||
                              !canSubmit
                            }
                            className="flex items-center gap-2"
                            variant="blue"
                          >
                            {isSubmitting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4" />
                            )}
                            <span>
                              {isSubmitting ? 'Saving...' : 'Save Changes'}
                            </span>
                          </Button>
                        </div>
                      </div>
                    )}
                  </form>
                </Form>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <PublicContentClearAlert
        open={showClearAlert}
        onOpenChange={setShowClearAlert}
        onConfirm={async () => {
          if (clearingField) {
            await handleClearField(
              clearingField as keyof PublicContentNotificationsFormValues,
            )
            setClearingField(null)
          }
        }}
        title={`Clear ${
          clearingField
            ? clearingField === 'discordWebhookUrls'
              ? 'General Discord Webhook URLs'
              : clearingField === 'discordWebhookUrlsMovies'
                ? 'Movie Discord Webhook URLs'
                : clearingField === 'discordWebhookUrlsShows'
                  ? 'Show Discord Webhook URLs'
                  : clearingField === 'appriseUrls'
                    ? 'General Apprise URLs'
                    : clearingField === 'appriseUrlsMovies'
                      ? 'Movie Apprise URLs'
                      : clearingField === 'appriseUrlsShows'
                        ? 'Show Apprise URLs'
                        : 'URLs'
            : 'URLs'
        }?`}
        description={`This will remove the ${clearingField ? (clearingField.includes('discord') ? 'Discord webhook URLs' : 'Apprise URLs') : 'URLs'} from this field and save the configuration.`}
      />
    </>
  )
}

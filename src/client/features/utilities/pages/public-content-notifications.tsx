import * as React from 'react'
import { Button } from '@/components/ui/button'
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
import { MultiInput } from '@/components/ui/multi-input'
import { Separator } from '@/components/ui/separator'
import { usePublicContentNotifications } from '@/features/utilities/hooks/usePublicContentNotifications'
import { PublicContentClearAlert } from '@/features/utilities/components/public-content-notifications/public-content-clear-alert'
import { useConfigStore } from '@/stores/configStore'
import { UtilitySectionHeader } from '@/components/ui/utility-section-header'
import { PublicContentNotificationsPageSkeleton } from '@/features/utilities/components/public-content-notifications/public-content-notifications-page-skeleton'
import { useInitializeWithMinDuration } from '@/hooks/useInitializeWithMinDuration'

// Type for string URL fields only (excludes boolean 'enabled' field)
type WebhookFieldName =
  | 'discordWebhookUrls'
  | 'discordWebhookUrlsMovies'
  | 'discordWebhookUrlsShows'
  | 'appriseUrls'
  | 'appriseUrlsMovies'
  | 'appriseUrlsShows'

/**
 * Maps webhook field names to human-readable labels for the clear alert dialog
 */
const getFieldLabel = (field: string | null): string => {
  const fieldLabels: Record<string, string> = {
    discordWebhookUrls: 'General Discord Webhook URLs',
    discordWebhookUrlsMovies: 'Movie Discord Webhook URLs',
    discordWebhookUrlsShows: 'Show Discord Webhook URLs',
    appriseUrls: 'General Apprise URLs',
    appriseUrlsMovies: 'Movie Apprise URLs',
    appriseUrlsShows: 'Show Apprise URLs',
  }
  return field ? fieldLabels[field] || field : ''
}

/**
 * Gets the service type (Discord or Apprise) for description text
 */
const getServiceType = (field: string | null): string => {
  if (!field) return 'URLs'
  return field.includes('discord') ? 'Discord webhook URLs' : 'Apprise URLs'
}

interface WebhookFieldProps {
  name: WebhookFieldName
  label: string
  placeholder: string
  tooltip: string
  helpText: string
  isTestable?: boolean
  testHandler?: () => void
  isTestLoading?: boolean
  testResult?: boolean | null
  showTestError?: boolean
  onClear: () => void
  value?: string | string[]
  disabled?: boolean
  form: ReturnType<typeof usePublicContentNotifications>['form']
}

/**
 * Renders a form field for entering one or more webhook URLs, supporting labels, tooltips, validation, and optional test and clear actions.
 *
 * Allows users to input up to five webhook URLs, with optional buttons to test the webhook connection (for testable fields) and to clear all values. Displays loading and result indicators for testing, and disables actions based on the field state.
 *
 * @param name - The unique field name for form binding
 * @param label - The label displayed above the input field
 * @param placeholder - Placeholder text for the input
 * @param tooltip - Tooltip text providing additional information about the field
 * @param isTestable - Whether to show a test button for webhook validation
 * @param testHandler - Handler function to trigger webhook testing
 * @param isTestLoading - Whether the test action is currently loading
 * @param testResult - The result of the most recent test, if any
 * @param showTestError - Whether to display an error tooltip for the test button
 * @param onClear - Handler function to clear the field value(s)
 * @param value - The current value(s) of the field
 * @param disabled - Whether the field and its actions are disabled
 * @param form - The form control object for managing field state
 *
 * @remarks
 * For Discord webhook fields, basic URL validation is enforced to match the expected Discord webhook URL pattern.
 */
function WebhookField({
  name,
  label,
  placeholder,
  tooltip,
  isTestable = false,
  testHandler,
  isTestLoading = false,
  testResult = null,
  showTestError = false,
  onClear,
  value,
  disabled = false,
  form,
}: WebhookFieldProps) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className="space-y-1">
          <div className="flex items-center">
            <FormLabel className="text-foreground m-0">{label}</FormLabel>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <InfoIcon className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">{tooltip}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <FormControl>
            <div className="flex gap-2">
              <MultiInput
                value={field.value}
                onChange={field.onChange}
                placeholder={placeholder}
                disabled={disabled}
                maxFields={5}
                className="flex-1"
              />
              {isTestable && (
                <TooltipProvider>
                  <Tooltip open={showTestError || undefined}>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        onClick={testHandler}
                        disabled={
                          disabled ||
                          !(Array.isArray(field.value)
                            ? field.value.length > 0
                            : Boolean(field.value))
                        }
                        size="icon"
                        variant="noShadow"
                        className="shrink-0"
                      >
                        {isTestLoading ? (
                          <Loader2 className="animate-spin" />
                        ) : testResult ? (
                          <Check className="text-black" />
                        ) : (
                          <Check />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent
                      className={showTestError ? 'bg-error text-black' : ''}
                    >
                      <p>Test connection</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {(Array.isArray(value) ? value.length > 0 : Boolean(value)) && (
                <Button
                  type="button"
                  variant="error"
                  size="icon"
                  onClick={onClear}
                  disabled={disabled}
                  className="shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

/**
 * Renders the Public Content Notifications configuration page, allowing users to manage and test Discord and Apprise webhook endpoints for broadcasting content availability.
 *
 * Users can enable or disable public notifications, add or remove webhook URLs for general, movie, and show categories, test Discord webhook connections, and clear individual fields with confirmation. The form enforces successful Discord webhook tests before saving changes and provides feedback on configuration and connection status.
 *
 * @returns The React element for the public content notifications settings page.
 */
export default function PublicContentNotificationsPage() {
  const { initialize, isInitialized } = useConfigStore()
  const isInitializing = useInitializeWithMinDuration(initialize)

  const {
    form,
    isSubmitting,
    isToggling,
    isClearing,
    testStatus,
    isAppriseEnabled,
    onSubmit,
    handleCancel,
    handleToggle,
    handleTestDiscordWebhook,
    handleClearField,
  } = usePublicContentNotifications()

  const [showClearAlert, setShowClearAlert] = React.useState(false)
  const [clearingField, setClearingField] =
    React.useState<WebhookFieldName | null>(null)

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
      // Error handling (user feedback, logging) is done in the hook
      // No additional handling needed at component level
    }
  }

  // Determine status based on configuration state
  const getStatus = () => {
    if (!isInitialized || isInitializing) return 'unknown'
    return isEnabled ? 'enabled' : 'disabled'
  }

  if (!isInitialized || isInitializing) {
    return <PublicContentNotificationsPageSkeleton />
  }

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <UtilitySectionHeader
        title="Public Content Notifications"
        description="Broadcast ALL content availability to public Discord channels and shared Apprise endpoints"
        status={getStatus()}
      />

      <div className="space-y-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Actions section */}
            <div>
              <h3 className="font-medium text-foreground mb-2">Actions</h3>
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
              </div>
            </div>

            <Separator />

            {/* Information about public content notifications */}
            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md">
              <h3 className="font-medium text-foreground mb-2">
                Public Content Broadcasting
              </h3>
              <p className="text-sm text-foreground">
                {isEnabled ? (
                  <>
                    Public content notifications are enabled. ALL content ready
                    notifications will be broadcast to the configured public
                    endpoints in addition to individual user notifications.
                    Movies and shows can be routed to specific endpoints, with
                    fallback to general endpoints if no specific ones are
                    configured. Discord notifications include @ mentions for
                    users who have the content watchlisted and have configured
                    Discord IDs.
                  </>
                ) : (
                  <>
                    Content notifications will only be sent to individual users
                    based on their personal notification settings. Enable this
                    feature to broadcast ALL content availability to public
                    Discord channels and shared Apprise endpoints for
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
                  <h3 className="font-medium text-foreground mb-4">
                    Discord Webhook Configuration
                  </h3>
                  <div className="space-y-4">
                    <WebhookField
                      name="discordWebhookUrls"
                      label="General Discord Webhook URLs"
                      placeholder="https://discord.com/api/webhooks/..."
                      tooltip="Discord webhook URLs for general content notifications. Use the + button to add multiple channels."
                      helpText="Discord webhook URLs for general content notifications"
                      isTestable={true}
                      testHandler={() => handleTestDiscordWebhook('general')}
                      isTestLoading={testStatus.isTestingGeneral}
                      testResult={testStatus.testResults.general}
                      showTestError={showGeneralTestError}
                      onClear={() => {
                        setClearingField('discordWebhookUrls')
                        setShowClearAlert(true)
                      }}
                      value={generalUrls}
                      disabled={
                        testStatus.isTestingGeneral ||
                        isSubmitting ||
                        isToggling ||
                        isClearing
                      }
                      form={form}
                    />

                    <WebhookField
                      name="discordWebhookUrlsMovies"
                      label="Movie-specific Discord Webhook URLs"
                      placeholder="https://discord.com/api/webhooks/..."
                      tooltip="Discord webhook URLs specifically for movie notifications. Use the + button to add multiple channels."
                      helpText="Discord webhook URLs specifically for movie notifications"
                      isTestable={true}
                      testHandler={() => handleTestDiscordWebhook('movies')}
                      isTestLoading={testStatus.isTestingMovies}
                      testResult={testStatus.testResults.movies}
                      showTestError={showMoviesTestError}
                      onClear={() => {
                        setClearingField('discordWebhookUrlsMovies')
                        setShowClearAlert(true)
                      }}
                      value={moviesUrls}
                      disabled={
                        testStatus.isTestingMovies ||
                        isSubmitting ||
                        isToggling ||
                        isClearing
                      }
                      form={form}
                    />

                    <WebhookField
                      name="discordWebhookUrlsShows"
                      label="Show-specific Discord Webhook URLs"
                      placeholder="https://discord.com/api/webhooks/..."
                      tooltip="Discord webhook URLs specifically for TV show notifications. Use the + button to add multiple channels."
                      helpText="Discord webhook URLs specifically for TV show notifications"
                      isTestable={true}
                      testHandler={() => handleTestDiscordWebhook('shows')}
                      isTestLoading={testStatus.isTestingShows}
                      testResult={testStatus.testResults.shows}
                      showTestError={showShowsTestError}
                      onClear={() => {
                        setClearingField('discordWebhookUrlsShows')
                        setShowClearAlert(true)
                      }}
                      value={showsUrls}
                      disabled={
                        testStatus.isTestingShows ||
                        isSubmitting ||
                        isToggling ||
                        isClearing
                      }
                      form={form}
                    />
                  </div>
                </div>

                <Separator />

                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <h3 className="font-medium text-foreground">
                      Apprise Configuration
                    </h3>
                    {!isAppriseEnabled && (
                      <span className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded-xs">
                        Apprise is disabled
                      </span>
                    )}
                  </div>
                  <div className="space-y-4">
                    <WebhookField
                      name="appriseUrls"
                      label="General Apprise URLs"
                      placeholder="discord://webhook_id/token"
                      tooltip="Apprise URLs for general content notifications. Use the + button to add multiple services."
                      helpText="Apprise URLs for general content notifications"
                      isTestable={false}
                      onClear={() => {
                        setClearingField('appriseUrls')
                        setShowClearAlert(true)
                      }}
                      value={appriseGeneralUrls}
                      disabled={
                        isSubmitting ||
                        isToggling ||
                        isClearing ||
                        !isAppriseEnabled
                      }
                      form={form}
                    />

                    <WebhookField
                      name="appriseUrlsMovies"
                      label="Movie-specific Apprise URLs"
                      placeholder="discord://webhook_id/token"
                      tooltip="Apprise URLs specifically for movie notifications. Use the + button to add multiple services."
                      helpText="Apprise URLs specifically for movie notifications"
                      isTestable={false}
                      onClear={() => {
                        setClearingField('appriseUrlsMovies')
                        setShowClearAlert(true)
                      }}
                      value={appriseMoviesUrls}
                      disabled={
                        isSubmitting ||
                        isToggling ||
                        isClearing ||
                        !isAppriseEnabled
                      }
                      form={form}
                    />

                    <WebhookField
                      name="appriseUrlsShows"
                      label="Show-specific Apprise URLs"
                      placeholder="discord://webhook_id/token"
                      tooltip="Apprise URLs specifically for TV show notifications. Use the + button to add multiple services."
                      helpText="Apprise URLs specifically for TV show notifications"
                      isTestable={false}
                      onClear={() => {
                        setClearingField('appriseUrlsShows')
                        setShowClearAlert(true)
                      }}
                      value={appriseShowsUrls}
                      disabled={
                        isSubmitting ||
                        isToggling ||
                        isClearing ||
                        !isAppriseEnabled
                      }
                      form={form}
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
                        disabled={isSubmitting || isToggling || isClearing}
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
                    <span>{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
                  </Button>
                </div>
              </div>
            )}
          </form>
        </Form>
      </div>

      <PublicContentClearAlert
        open={showClearAlert}
        onOpenChange={setShowClearAlert}
        onConfirm={async () => {
          if (clearingField) {
            await handleClearField(clearingField)
            setClearingField(null)
          }
        }}
        title={`Clear ${getFieldLabel(clearingField)}?`}
        description={`This will remove the ${getServiceType(clearingField)} from this field and save the configuration.`}
      />
    </div>
  )
}

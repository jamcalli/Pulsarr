import { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Loader2, Save, X, HelpCircle } from 'lucide-react'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
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
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useConfigStore } from '@/stores/configStore'
import { toast } from 'sonner'
import { UtilitySectionHeader } from '@/components/ui/utility-section-header'
import { NewUserDefaultsPageSkeleton } from '@/features/utilities/components/new-user-defaults/new-user-defaults-page-skeleton'
import { useInitializeWithMinDuration } from '@/hooks/useInitializeWithMinDuration'

const newUserDefaultsSchema = z.object({
  canSync: z.boolean(),
  requiresApproval: z.boolean(),
  movieQuotaEnabled: z.boolean(),
  movieQuotaType: z.enum(['daily', 'weekly_rolling', 'monthly']),
  movieQuotaLimit: z.number().min(1).max(1000),
  movieBypassApproval: z.boolean(),
  showQuotaEnabled: z.boolean(),
  showQuotaType: z.enum(['daily', 'weekly_rolling', 'monthly']),
  showQuotaLimit: z.number().min(1).max(1000),
  showBypassApproval: z.boolean(),
})

type NewUserDefaultsFormData = z.infer<typeof newUserDefaultsSchema>

/**
 * Displays an administrative page for configuring default settings applied to newly discovered Plex users.
 *
 * Provides a validated form and real-time status summary for setting default sync behavior, manual approval requirements, and quota limits for movies and shows. Allows administrators to save or cancel changes, with user feedback on success or failure.
 */
export default function NewUserDefaultsPage() {
  const { config, updateConfig, isInitialized, initialize } = useConfigStore()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submittingStartTime = useRef<number | null>(null)
  const isInitializing = useInitializeWithMinDuration(initialize)

  const form = useForm<NewUserDefaultsFormData>({
    resolver: zodResolver(newUserDefaultsSchema),
    defaultValues: {
      canSync: config?.newUserDefaultCanSync ?? true,
      requiresApproval: config?.newUserDefaultRequiresApproval ?? false,
      movieQuotaEnabled: config?.newUserDefaultMovieQuotaEnabled ?? false,
      movieQuotaType: config?.newUserDefaultMovieQuotaType ?? 'monthly',
      movieQuotaLimit: config?.newUserDefaultMovieQuotaLimit ?? 10,
      movieBypassApproval: config?.newUserDefaultMovieBypassApproval ?? false,
      showQuotaEnabled: config?.newUserDefaultShowQuotaEnabled ?? false,
      showQuotaType: config?.newUserDefaultShowQuotaType ?? 'monthly',
      showQuotaLimit: config?.newUserDefaultShowQuotaLimit ?? 10,
      showBypassApproval: config?.newUserDefaultShowBypassApproval ?? false,
    },
  })

  // Watch form values for dynamic UI updates
  const canSync = form.watch('canSync')
  const movieQuotaEnabled = form.watch('movieQuotaEnabled')
  const showQuotaEnabled = form.watch('showQuotaEnabled')

  // Reset form when config changes
  useEffect(() => {
    if (config) {
      const formValues = {
        canSync: config.newUserDefaultCanSync ?? true,
        requiresApproval: config.newUserDefaultRequiresApproval ?? false,
        movieQuotaEnabled: config.newUserDefaultMovieQuotaEnabled ?? false,
        movieQuotaType: config.newUserDefaultMovieQuotaType ?? 'monthly',
        movieQuotaLimit: config.newUserDefaultMovieQuotaLimit ?? 10,
        movieBypassApproval: config.newUserDefaultMovieBypassApproval ?? false,
        showQuotaEnabled: config.newUserDefaultShowQuotaEnabled ?? false,
        showQuotaType: config.newUserDefaultShowQuotaType ?? 'monthly',
        showQuotaLimit: config.newUserDefaultShowQuotaLimit ?? 10,
        showBypassApproval: config.newUserDefaultShowBypassApproval ?? false,
      }
      form.reset(formValues)
    }
  }, [config, form])

  const onSubmit = async (data: NewUserDefaultsFormData) => {
    submittingStartTime.current = Date.now()
    setIsSubmitting(true)

    try {
      await updateConfig({
        newUserDefaultCanSync: data.canSync,
        newUserDefaultRequiresApproval: data.requiresApproval,
        newUserDefaultMovieQuotaEnabled: data.movieQuotaEnabled,
        newUserDefaultMovieQuotaType: data.movieQuotaType,
        newUserDefaultMovieQuotaLimit: data.movieQuotaLimit,
        newUserDefaultMovieBypassApproval: data.movieBypassApproval,
        newUserDefaultShowQuotaEnabled: data.showQuotaEnabled,
        newUserDefaultShowQuotaType: data.showQuotaType,
        newUserDefaultShowQuotaLimit: data.showQuotaLimit,
        newUserDefaultShowBypassApproval: data.showBypassApproval,
      })

      // Ensure minimum loading time for better UX
      const elapsed = Date.now() - (submittingStartTime.current || 0)
      const remaining = Math.max(0, 500 - elapsed)

      await new Promise((resolve) => setTimeout(resolve, remaining))

      toast.success('New user default settings updated successfully')
    } catch (error) {
      console.error('Failed to update new user defaults:', error)
      toast.error('Failed to update new user default settings')
    } finally {
      setIsSubmitting(false)
      submittingStartTime.current = null
    }
  }

  const handleCancel = () => {
    form.reset()
  }

  // No status needed for header - we'll show detailed status in the body

  if (!isInitialized || isInitializing) {
    return <NewUserDefaultsPageSkeleton />
  }

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <UtilitySectionHeader
        title="New User Defaults"
        description="Configure default settings for newly discovered Plex users"
        showStatus={false}
      />

      <div className="space-y-6">
        {/* Current Status section */}
        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md">
          <h3 className="font-medium text-foreground mb-2">Current Status</h3>
          <p className="text-sm text-foreground mb-3">
            New Plex users will be created with the following default settings:
          </p>

          {/* Sync Configuration Status */}
          <div className="mb-3">
            <h4 className="font-medium text-sm text-foreground">
              Sync Configuration
            </h4>
            <ul className="mt-1 space-y-1">
              <li className="text-sm">
                <span
                  className={`font-medium ${canSync ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                >
                  Sync
                </span>
                <span className="text-foreground ml-2">
                  {canSync ? 'Enabled by default' : 'Disabled by default'}
                </span>
              </li>
            </ul>
          </div>

          {/* Approval Configuration Status */}
          <div className="mb-3">
            <h4 className="font-medium text-sm text-foreground">
              Approval Configuration
            </h4>
            <ul className="mt-1 space-y-1">
              <li className="text-sm">
                <span
                  className={`font-medium ${form.watch('requiresApproval') ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}
                >
                  Manual Approval
                </span>
                <span className="text-foreground ml-2">
                  {form.watch('requiresApproval')
                    ? 'Required for all content'
                    : 'Not required by default'}
                </span>
              </li>
            </ul>
          </div>

          {/* Movie Quota Status */}
          <div className="mb-3">
            <h4 className="font-medium text-sm text-foreground">
              Movie Quotas
            </h4>
            <ul className="mt-1 space-y-1">
              <li className="text-sm">
                <span
                  className={`font-medium ${movieQuotaEnabled ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}`}
                >
                  Movie Quotas
                </span>
                <span className="text-foreground ml-2">
                  {movieQuotaEnabled
                    ? `${form.watch('movieQuotaType')} limit of ${form.watch('movieQuotaLimit')} movies${form.watch('movieBypassApproval') ? ' (auto-approve when exceeded)' : ''}`
                    : 'Unlimited by default'}
                </span>
              </li>
            </ul>
          </div>

          {/* Show Quota Status */}
          <div>
            <h4 className="font-medium text-sm text-foreground">Show Quotas</h4>
            <ul className="mt-1 space-y-1">
              <li className="text-sm">
                <span
                  className={`font-medium ${showQuotaEnabled ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}`}
                >
                  Show Quotas
                </span>
                <span className="text-foreground ml-2">
                  {showQuotaEnabled
                    ? `${form.watch('showQuotaType')} limit of ${form.watch('showQuotaLimit')} shows${form.watch('showBypassApproval') ? ' (auto-approve when exceeded)' : ''}`
                    : 'Unlimited by default'}
                </span>
              </li>
            </ul>
          </div>
        </div>

        <Separator />

        {/* Configuration form */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Sync Configuration */}
            <div>
              <h3 className="font-medium text-foreground mb-4">
                Sync Configuration
              </h3>
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="canSync"
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
                          Enable sync by default
                        </FormLabel>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs">
                                When enabled, newly discovered Plex users will
                                automatically have their watchlists synced to
                                Sonarr/Radarr
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

            <Separator />

            {/* Approval Configuration */}
            <div>
              <h3 className="font-medium text-foreground mb-4">
                Approval Configuration
              </h3>
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="requiresApproval"
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
                          Require manual approval by default
                        </FormLabel>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs">
                                When enabled, new users will need manual
                                approval for ALL content requests, regardless of
                                quota settings
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

            <Separator />

            {/* Movie Quota Configuration */}
            <div>
              <h3 className="font-medium text-foreground mb-4">
                Movie Quota Configuration
              </h3>
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="movieQuotaEnabled"
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
                          Enable movie quotas by default
                        </FormLabel>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs">
                                When enabled, new users will have movie quota
                                limits applied
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </FormItem>
                  )}
                />

                {movieQuotaEnabled && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="movieQuotaType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground">
                            Movie Quota Type
                          </FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select quota type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="daily">Daily</SelectItem>
                              <SelectItem value="weekly_rolling">
                                Weekly Rolling
                              </SelectItem>
                              <SelectItem value="monthly">Monthly</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="movieQuotaLimit"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground">
                            Movie Limit
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="1"
                              max="1000"
                              {...field}
                              onChange={(e) =>
                                field.onChange(Number.parseInt(e.target.value))
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="movieBypassApproval"
                      render={({ field }) => (
                        <FormItem className="flex flex-col justify-end h-full">
                          <div className="flex items-center space-x-2">
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="flex items-center">
                              <FormLabel className="text-foreground m-0">
                                Auto-approve when quota exceeded
                              </FormLabel>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">
                                      When enabled, movie requests that exceed
                                      quota limits will be automatically
                                      approved
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </div>
                          <div className="mb-2" />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Show Quota Configuration */}
            <div>
              <h3 className="font-medium text-foreground mb-4">
                Show Quota Configuration
              </h3>
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="showQuotaEnabled"
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
                          Enable show quotas by default
                        </FormLabel>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs">
                                When enabled, new users will have show quota
                                limits applied
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </FormItem>
                  )}
                />

                {showQuotaEnabled && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="showQuotaType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground">
                            Show Quota Type
                          </FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select quota type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="daily">Daily</SelectItem>
                              <SelectItem value="weekly_rolling">
                                Weekly Rolling
                              </SelectItem>
                              <SelectItem value="monthly">Monthly</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="showQuotaLimit"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground">
                            Show Limit
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="1"
                              max="1000"
                              {...field}
                              onChange={(e) =>
                                field.onChange(Number.parseInt(e.target.value))
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="showBypassApproval"
                      render={({ field }) => (
                        <FormItem className="flex flex-col justify-end h-full">
                          <div className="flex items-center space-x-2">
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="flex items-center">
                              <FormLabel className="text-foreground m-0">
                                Auto-approve when quota exceeded
                              </FormLabel>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">
                                      When enabled, show requests that exceed
                                      quota limits will be automatically
                                      approved
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </div>
                          <div className="mb-2" />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
              {form.formState.isDirty && !isSubmitting && (
                <Button
                  type="button"
                  variant="cancel"
                  onClick={handleCancel}
                  disabled={isSubmitting}
                  className="flex items-center gap-1"
                >
                  <X className="h-4 w-4" />
                  <span>Cancel</span>
                </Button>
              )}

              <Button
                type="submit"
                disabled={isSubmitting || !form.formState.isDirty}
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
          </form>
        </Form>
      </div>
    </div>
  )
}

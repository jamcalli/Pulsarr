import { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Loader2, Power } from 'lucide-react'
import { Form } from '@/components/ui/form'
import { Separator } from '@/components/ui/separator'
import { useConfigStore } from '@/stores/configStore'
import { toast } from 'sonner'
import { UtilitySectionHeader } from '@/components/ui/utility-section-header'
import { NewUserDefaultsPageSkeleton } from '@/features/utilities/components/new-user-defaults/new-user-defaults-page-skeleton'

const newUserDefaultsSchema = z.object({
  canSync: z.boolean(),
})

type NewUserDefaultsFormData = z.infer<typeof newUserDefaultsSchema>

/**
 * New User Defaults utility page - provides configuration for default settings when new Plex users are discovered.
 *
 * Users can toggle whether newly discovered Plex users have sync enabled by default, with immediate auto-save functionality and contextual information about how the setting affects new user behavior.
 */
export default function NewUserDefaultsPage() {
  const { config, updateConfig, isInitialized, initialize } = useConfigStore()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submittingStartTime = useRef<number | null>(null)

  // Initialize store on mount
  useEffect(() => {
    initialize()
  }, [initialize])

  const form = useForm<NewUserDefaultsFormData>({
    resolver: zodResolver(newUserDefaultsSchema),
    defaultValues: {
      canSync: config?.newUserDefaultCanSync ?? true,
    },
  })

  // Determine the enabled status
  const isEnabled = form.watch('canSync')

  // Reset form when config changes
  useEffect(() => {
    if (config) {
      const formValues = {
        canSync: config.newUserDefaultCanSync ?? true,
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

  // Determine status based on configuration state
  const getStatus = () => {
    if (!isInitialized) return 'unknown'
    return isEnabled ? 'enabled' : 'disabled'
  }

  if (!isInitialized) {
    return <NewUserDefaultsPageSkeleton />
  }

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <UtilitySectionHeader
        title="New User Defaults"
        description="Configure default settings for newly discovered Plex users"
        status={getStatus()}
      />

      <div className="space-y-6">
        <Form {...form}>
          {/* Actions section */}
          <div>
            <h3 className="font-medium text-foreground mb-2">Actions</h3>
            <div className="flex flex-wrap items-center gap-4">
              <Button
                type="button"
                size="sm"
                onClick={async () => {
                  setIsSubmitting(true)
                  const newEnabledState = !isEnabled
                  form.setValue('canSync', newEnabledState, {
                    shouldDirty: true,
                  })
                  // Auto-save when toggling enable/disable
                  await onSubmit(form.getValues())
                }}
                disabled={isSubmitting}
                variant={isEnabled ? 'error' : 'noShadow'}
                className="h-8"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Power className="h-4 w-4" />
                )}
                <span className="ml-2">
                  {isEnabled ? 'Disable Sync' : 'Enable Sync'}
                </span>
              </Button>
            </div>
          </div>

          <Separator />

          {/* Information about new user defaults */}
          <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md">
            <h3 className="font-medium text-foreground mb-2">
              New User Sync Behavior
            </h3>
            <p className="text-sm text-foreground">
              {isEnabled ? (
                <>
                  New Plex users will automatically have their watchlists
                  synced. This means their content will be immediately processed
                  and sent to Sonarr/Radarr.
                </>
              ) : (
                <>
                  New Plex users will be created with sync disabled by default.
                  This prevents overwhelming the system when users with large
                  existing watchlists are discovered. Administrators can
                  manually enable sync for specific users as needed.
                </>
              )}
            </p>
          </div>
        </Form>
      </div>
    </div>
  )
}

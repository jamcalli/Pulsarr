import { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Power } from 'lucide-react'
import { Form } from '@/components/ui/form'
import { cn } from '@/lib/utils'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Separator } from '@/components/ui/separator'
import { useConfigStore } from '@/stores/configStore'
import { toast } from 'sonner'
import { useMediaQuery } from '@/hooks/use-media-query'

const newUserDefaultsSchema = z.object({
  canSync: z.boolean(),
})

type NewUserDefaultsFormData = z.infer<typeof newUserDefaultsSchema>

/**
 * Displays a form within an accordion to set whether newly discovered Plex users have sync enabled by default.
 *
 * Loads the current default sync setting from configuration, allows toggling and auto-saving the setting, and provides immediate feedback via toast notifications. The interface adapts for mobile screens and includes contextual information about how the sync default affects new users.
 */
export function NewUserDefaultsForm() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const { config, updateConfig } = useConfigStore()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submittingStartTime = useRef<number | null>(null)

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

  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem
        value="new-user-defaults"
        className="border-2 border-border rounded-base overflow-hidden"
      >
        <AccordionTrigger className="px-6 py-4 bg-main hover:bg-main hover:no-underline">
          <div className="flex justify-between items-center w-full pr-2">
            <div>
              <h3 className="text-lg font-medium text-black text-left">
                New User Defaults
              </h3>
              <p className="text-sm text-black text-left">
                Configure default settings for newly discovered Plex users
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
                      <span className={isMobile ? 'hidden' : 'ml-2'}>
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
                        synced. This means their content will be immediately
                        processed and sent to Sonarr/Radarr.
                      </>
                    ) : (
                      <>
                        New Plex users will be created with sync disabled by
                        default. This prevents overwhelming the system when
                        users with large existing watchlists are discovered.
                        Administrators can manually enable sync for specific
                        users as needed.
                      </>
                    )}
                  </p>
                </div>
              </Form>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

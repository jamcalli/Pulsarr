import { HelpCircle, Loader2, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useDefaultRoutingBehavior } from '@/features/content-router/hooks/useDefaultRoutingBehavior'

/**
 * Global setting that controls what happens to content matching no router rule.
 *
 * When the toggle is off (default), unmatched content falls back to the default
 * Radarr/Sonarr instance. When on, unmatched content is skipped entirely and
 * never sent to Radarr/Sonarr. Edits a single global config field, so the same
 * value is shown on both the Radarr and Sonarr content router pages.
 */
export default function DefaultRoutingBehaviorSection() {
  const { form, isSaving, onSubmit, handleCancel } = useDefaultRoutingBehavior()

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Default Routing Behavior</CardTitle>
        <CardDescription>
          Choose what happens to content that matches none of the routes below.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="skipDefaultRoutingWhenNoMatch"
              render={({ field }) => (
                <FormItem className="flex items-center space-x-2">
                  <FormControl>
                    <Switch
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                      disabled={isSaving}
                    />
                  </FormControl>
                  <div className="flex items-center">
                    <FormLabel className="text-foreground m-0">
                      Skip content that matches no route
                    </FormLabel>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="max-w-xs space-y-2">
                          <p>
                            When <strong>off</strong> (default), content that
                            matches none of your content router rules is sent to
                            your default Radarr/Sonarr instance.
                          </p>
                          <p>
                            When <strong>on</strong>, unmatched content is
                            skipped entirely and never sent to Radarr/Sonarr —
                            only content that matches a route is added. This
                            also applies during sync operations.
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Save/Cancel buttons */}
            <div className="flex justify-end gap-2 pt-4 border-t border-border">
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
      </CardContent>
    </Card>
  )
}

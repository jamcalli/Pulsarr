import { HelpCircle, Loader2, Power, RefreshCw, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { UtilitySectionHeader } from '@/components/ui/utility-section-header'
import { useMaintainerr } from '@/features/utilities/hooks/useMaintainerr'

export function MaintainerrSection() {
  const {
    form,
    status,
    isEnabled,
    hasUrl,
    isSaving,
    isSyncing,
    isToggling,
    onSubmit,
    handleCancel,
    handleToggle,
    syncNow,
  } = useMaintainerr()

  const getStatus = () => {
    if (!isEnabled) return 'disabled'
    if (
      status?.status === 'error' ||
      status?.status === 'unsupported_version'
    ) {
      return 'failed'
    }
    if (status?.status === 'ok') return 'enabled'
    return 'unknown'
  }

  const failureDetail =
    isEnabled && status?.status === 'unsupported_version'
      ? `Maintainerr ${status.version} does not support this integration - upgrade to 3.23.0 or later`
      : isEnabled && status?.status === 'error'
        ? (status.error ?? 'Sync failed')
        : null

  return (
    <div>
      <UtilitySectionHeader
        title="Maintainerr Integration"
        description="Automatically exclude media that Maintainerr deletes so stale watchlist entries don't regrab it"
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
              onClick={() => handleToggle(!isEnabled)}
              disabled={
                isToggling ||
                isSaving ||
                (!isEnabled && !hasUrl) ||
                form.formState.isDirty
              }
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
              onClick={syncNow}
              disabled={
                isSyncing ||
                isToggling ||
                !hasUrl ||
                !isEnabled ||
                form.formState.isDirty
              }
              variant="noShadow"
              className="h-8"
            >
              {isSyncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-2">Sync Now</span>
            </Button>
          </div>

          {failureDetail && (
            <div className="mt-2 text-sm text-error">{failureDetail}</div>
          )}

          {form.formState.isDirty && (
            <div className="mt-2 text-sm text-error">
              You have unsaved changes. Please save your configuration before
              enabling or syncing.
            </div>
          )}
        </div>

        <Separator />

        {/* Configuration form */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="maintainerrUrl"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <div className="flex items-center">
                      <FormLabel className="text-foreground m-0">
                        Maintainerr URL
                      </FormLabel>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">
                            Base URL of your Maintainerr instance. Pulsarr
                            configures the webhook and rule group connections
                            there automatically.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="http://localhost:6246"
                        disabled={isSaving}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="maintainerrExclusionMode"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <div className="flex items-center">
                      <FormLabel className="text-foreground m-0">
                        Exclusion Mode
                      </FormLabel>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="max-w-xs space-y-2">
                            <p>
                              Choose who gets excluded when media is deleted:
                            </p>
                            <ul className="list-disc pl-4 text-sm">
                              <li>
                                <strong>Current watchlisters:</strong> Only
                                users who have the item watchlisted now. Anyone
                                adding it later requests it fresh.
                              </li>
                              <li>
                                <strong>Global:</strong> Blocks the item for
                                everyone until the exclusion is removed.
                              </li>
                            </ul>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <FormControl>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || 'watchlisters'}
                        disabled={isSaving}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select exclusion mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="watchlisters">
                            Current watchlisters
                          </SelectItem>
                          <SelectItem value="global">Global</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Action buttons */}
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
                variant="bluenoShadow"
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
  )
}

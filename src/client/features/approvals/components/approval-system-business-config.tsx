import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { HelpCircle, Save, X, Loader2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { UseFormReturn } from 'react-hook-form'
import type { ApprovalConfigurationFormData } from '@/features/plex/hooks/useApprovalConfiguration'

interface ApprovalSystemBusinessConfigProps {
  form: UseFormReturn<ApprovalConfigurationFormData>
  onSubmit: (data: ApprovalConfigurationFormData) => Promise<void>
  onCancel: () => void
  isSaving: boolean
  submittedValues: ApprovalConfigurationFormData | null
  hasChanges: boolean
  isScheduleEnabled: boolean
  isLoading: boolean
}

/**
 * Renders a form for configuring approval system business logic, including approval expiration policies, per-trigger expiration overrides, and cleanup settings.
 *
 * The form allows enabling or disabling approval expiration, setting default and trigger-specific expiration times, choosing the action on expiration, and specifying retention duration for expired requests. Inputs are conditionally enabled based on loading state and whether the approval maintenance schedule is active. Save and cancel controls are shown when there are unsaved changes.
 */
export function ApprovalSystemBusinessConfig({
  form,
  onSubmit,
  onCancel,
  isSaving,
  submittedValues,
  hasChanges,
  isScheduleEnabled,
  isLoading,
}: ApprovalSystemBusinessConfigProps) {
  // Show submitted values during save or current form values - matching delete sync pattern
  const displayValues =
    isSaving && submittedValues ? submittedValues : form.getValues()
  const isExpirationEnabled = displayValues.approvalExpiration?.enabled ?? false
  const isDisabled = isLoading || !isScheduleEnabled

  return (
    <div>
      <h3 className="font-medium text-foreground mb-4">
        Business Logic Configuration
      </h3>

      {/* Schedule Dependency Warning */}
      {!isScheduleEnabled && (
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
          <div className="flex items-start">
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 mr-2 shrink-0" />
            <div className="text-sm text-yellow-800 dark:text-yellow-200">
              <p className="font-medium">Schedule Required</p>
              <p>
                These settings control approval expiration behavior, but they
                won't function until the approval maintenance schedule is
                enabled above.
              </p>
            </div>
          </div>
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Approval Expiration Section */}
          <div className={cn('space-y-4', !isScheduleEnabled && 'opacity-60')}>
            <div>
              <h4 className="font-medium text-foreground mb-3">
                Approval Expiration
              </h4>

              {/* Enable Expiration */}
              <FormField
                control={form.control}
                name="approvalExpiration.enabled"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <div className="flex items-center">
                      <FormLabel className="text-foreground m-0">
                        Enable Approval Expiration
                      </FormLabel>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">
                              When enabled, approval requests will automatically
                              expire after the configured time period. Processed
                              by the approval maintenance schedule.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isDisabled}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* Default Expiration Hours */}
              <FormField
                control={form.control}
                name="approvalExpiration.defaultExpirationHours"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <div className="flex items-center">
                      <FormLabel className="text-foreground m-0">
                        Default Expiration Hours
                      </FormLabel>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">
                              Default number of hours before approval requests
                              expire. Can be overridden per trigger type below.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="Enter hours (1-8760)"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                        className="w-48"
                        min={1}
                        max={8760}
                        disabled={isDisabled || !isExpirationEnabled}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Expiration Action */}
              <FormField
                control={form.control}
                name="approvalExpiration.expirationAction"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <div className="flex items-center">
                      <FormLabel className="text-foreground m-0">
                        Expiration Action
                      </FormLabel>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="max-w-xs space-y-2">
                              <p>Action taken when requests expire:</p>
                              <ul className="list-disc pl-4 text-sm">
                                <li>
                                  <strong>Expire:</strong> Mark as expired, no
                                  further action
                                </li>
                                <li>
                                  <strong>Auto-approve:</strong> Automatically
                                  approve and route expired requests
                                </li>
                              </ul>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <FormControl>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isDisabled || !isExpirationEnabled}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue placeholder="Select action" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="expire">Expire</SelectItem>
                          <SelectItem value="auto_approve">
                            Auto-approve
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Per-Trigger Overrides */}
            {isExpirationEnabled && (
              <div className="space-y-4">
                <h5 className="font-medium text-foreground text-sm">
                  Per-Trigger Expiration Overrides
                </h5>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="approvalExpiration.quotaExceededExpirationHours"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <div className="flex items-center">
                          <FormLabel className="text-foreground m-0 text-sm">
                            Quota Exceeded Override
                          </FormLabel>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">
                                  Custom expiration time for approvals triggered
                                  by quota limits. Leave empty to use the
                                  default expiration time.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="Default"
                            {...field}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value
                                  ? Number(e.target.value)
                                  : undefined,
                              )
                            }
                            className="w-32"
                            min={1}
                            max={8760}
                            disabled={isDisabled}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="approvalExpiration.routerRuleExpirationHours"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <div className="flex items-center">
                          <FormLabel className="text-foreground m-0 text-sm">
                            Router Rule Override
                          </FormLabel>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">
                                  Custom expiration time for approvals triggered
                                  by router rules. Leave empty to use the
                                  default expiration time.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="Default"
                            {...field}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value
                                  ? Number(e.target.value)
                                  : undefined,
                              )
                            }
                            className="w-32"
                            min={1}
                            max={8760}
                            disabled={isDisabled}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="approvalExpiration.manualFlagExpirationHours"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <div className="flex items-center">
                          <FormLabel className="text-foreground m-0 text-sm">
                            Manual Flag Override
                          </FormLabel>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">
                                  Custom expiration time for approvals triggered
                                  by manual flags. Leave empty to use the
                                  default expiration time.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="Default"
                            {...field}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value
                                  ? Number(e.target.value)
                                  : undefined,
                              )
                            }
                            className="w-32"
                            min={1}
                            max={8760}
                            disabled={isDisabled}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="approvalExpiration.contentCriteriaExpirationHours"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <div className="flex items-center">
                          <FormLabel className="text-foreground m-0 text-sm">
                            Content Criteria Override
                          </FormLabel>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">
                                  Custom expiration time for approvals triggered
                                  by content criteria. Leave empty to use the
                                  default expiration time.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="Default"
                            {...field}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value
                                  ? Number(e.target.value)
                                  : undefined,
                              )
                            }
                            className="w-32"
                            min={1}
                            max={8760}
                            disabled={isDisabled}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}

            {/* Cleanup Settings */}
            <div>
              <h5 className="font-medium text-foreground text-sm mb-3">
                Cleanup Settings
              </h5>

              <FormField
                control={form.control}
                name="approvalExpiration.cleanupExpiredDays"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <div className="flex items-center">
                      <FormLabel className="text-foreground m-0 text-sm">
                        Expired Request Retention (Days)
                      </FormLabel>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">
                              Number of days to keep expired approval requests
                              before the approval maintenance schedule
                              permanently deletes them.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="Enter days (1-365)"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                        className="w-48"
                        min={1}
                        max={365}
                        disabled={isDisabled || !isExpirationEnabled}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Save/Cancel Controls */}
          {hasChanges && (
            <div className="flex gap-2 pt-4 border-t">
              <Button
                type="submit"
                disabled={isSaving || isDisabled}
                className="h-8"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                <span className="ml-2">
                  {isSaving ? 'Saving...' : 'Save Configuration'}
                </span>
              </Button>

              <Button
                type="button"
                variant="neutral"
                onClick={onCancel}
                disabled={isSaving}
                className="h-8"
              >
                <X className="h-4 w-4" />
                <span className="ml-2">Cancel</span>
              </Button>
            </div>
          )}
        </form>
      </Form>
    </div>
  )
}

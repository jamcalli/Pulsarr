import { zodResolver } from '@hookform/resolvers/zod'
import {
  DEFAULT_NOTIFICATION_DELIVERY,
  NotificationDeliveryDefaultsSchema,
} from '@root/schemas/notifications/delivery-schedule.schema'
import { InfoIcon, Loader2, Save, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'
import { TimeZoneInput } from '@/components/time-zone-input'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
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
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { updateConfig, useConfig } from '@/hooks/useConfig'

type DeliveryFormValues = z.input<typeof NotificationDeliveryDefaultsSchema>

interface DeliveryScheduleFormProps {
  isInitialized: boolean
}

const serverTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

/**
 * Admin defaults for quiet hours and digest batching of media-available
 * notifications. Users inherit these unless overridden on the Users page.
 */
export function DeliveryScheduleForm({
  isInitialized,
}: DeliveryScheduleFormProps) {
  const { config } = useConfig()
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle')

  const form = useForm<DeliveryFormValues>({
    resolver: zodResolver(NotificationDeliveryDefaultsSchema),
    mode: 'onBlur',
    defaultValues: DEFAULT_NOTIFICATION_DELIVERY,
  })

  const current = config?.notificationDelivery

  useEffect(() => {
    if (!current) return
    form.reset({ ...DEFAULT_NOTIFICATION_DELIVERY, ...current })
    // Controlled Radix Selects ignore a value applied in the same tick as mount
    setTimeout(() => {
      form.setValue('digestMode', current.digestMode, { shouldDirty: false })
      form.reset(form.getValues(), { keepDirty: false })
    }, 0)
  }, [current, form])

  const onSubmit = async (values: DeliveryFormValues) => {
    setStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )
      const notificationDelivery =
        NotificationDeliveryDefaultsSchema.parse(values)
      await Promise.all([
        updateConfig({ notificationDelivery }),
        minimumLoadingTime,
      ])
      form.reset(notificationDelivery)
      setStatus('success')
      toast.success('Quiet hours and digest settings have been updated')
      setTimeout(() => setStatus('idle'), 1000)
    } catch (error) {
      console.error('Delivery schedule update error:', error)
      toast.error('Failed to update quiet hours and digest settings')
      setStatus('idle')
    }
  }

  const digestMode = form.watch('digestMode')
  const quietHoursEnabled = form.watch('quietHoursEnabled')
  const disabled = status === 'loading'

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="flex items-center gap-1">
          <h3 className="text-lg font-medium text-foreground">
            Quiet Hours &amp; Digests
          </h3>
          <Tooltip>
            <TooltipTrigger asChild>
              <InfoIcon className="h-4 w-4 text-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Defaults for users' "now available" notifications (Discord DM,
              Apprise, Plex mobile). Each user can override these on the Users
              page. Admin and public channel notifications are never delayed.
            </TooltipContent>
          </Tooltip>
        </div>

        <FormField
          control={form.control}
          name="digestMode"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-foreground">Batching</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value}
                disabled={disabled}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select batching" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="off">Off (send immediately)</SelectItem>
                  <SelectItem value="window">Batch window</SelectItem>
                  <SelectItem value="daily">Daily digest</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                Batched notifications are combined into one message per user,
                e.g. "Show X: S02E01–E08".
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {digestMode === 'window' && (
          <FormField
            control={form.control}
            name="digestWindowMinutes"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-foreground">
                  Batch Window (minutes)
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="number"
                    min={1}
                    max={1440}
                    step={1}
                    value={field.value?.toString() ?? ''}
                    onChange={(e) => {
                      const v = e.currentTarget.valueAsNumber
                      field.onChange(Number.isNaN(v) ? undefined : v)
                    }}
                    disabled={disabled}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {digestMode === 'daily' && (
          <FormField
            control={form.control}
            name="digestTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-foreground">Digest Time</FormLabel>
                <FormControl>
                  <Input {...field} type="time" disabled={disabled} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="quietHoursEnabled"
          render={({ field }) => (
            <FormItem className="flex items-center space-x-2">
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={disabled}
                />
              </FormControl>
              <FormLabel className="text-foreground m-0">Quiet Hours</FormLabel>
            </FormItem>
          )}
        />

        {quietHoursEnabled && (
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="quietHoursStart"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground">From</FormLabel>
                  <FormControl>
                    <Input {...field} type="time" disabled={disabled} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="quietHoursEnd"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground">Until</FormLabel>
                  <FormControl>
                    <Input {...field} type="time" disabled={disabled} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        <FormField
          control={form.control}
          name="timezone"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-foreground">Time Zone</FormLabel>
              <FormControl>
                <TimeZoneInput
                  name={field.name}
                  onBlur={field.onBlur}
                  value={field.value}
                  onChange={(value) => field.onChange(value ?? '')}
                  placeholder={`Server time zone (${serverTimeZone})`}
                  disabled={disabled}
                />
              </FormControl>
              <FormDescription>
                Quiet hours and digest times use this zone. Leave empty to use
                the server's TZ setting.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 mt-4">
          {form.formState.isDirty && (
            <Button
              type="button"
              variant="cancel"
              onClick={() =>
                form.reset({ ...DEFAULT_NOTIFICATION_DELIVERY, ...current })
              }
              disabled={disabled}
              className="flex items-center gap-1"
            >
              <X className="h-4 w-4" />
              <span>Cancel</span>
            </Button>
          )}
          <Button
            type="submit"
            disabled={disabled || !form.formState.isDirty || !isInitialized}
            className="flex items-center gap-2"
            variant="bluenoShadow"
          >
            {status === 'loading' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>{status === 'success' ? 'Saved' : 'Save Changes'}</span>
              </>
            )}
          </Button>
        </div>
      </form>
    </Form>
  )
}

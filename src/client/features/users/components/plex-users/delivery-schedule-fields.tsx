import type { DigestMode } from '@root/schemas/notifications/delivery-schedule.schema'
import { DEFAULT_NOTIFICATION_DELIVERY } from '@root/schemas/notifications/delivery-schedule.schema'
import type { UseFormReturn } from 'react-hook-form'
import type { z } from 'zod'
import { TimeZoneInput } from '@/components/time-zone-input'
import {
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
import { useConfig } from '@/hooks/useConfig'
import type { plexUserSchema } from '@/lib/plex-schemas'

const INHERIT = 'inherit'

const DIGEST_LABELS: Record<DigestMode, string> = {
  off: 'Off',
  window: 'Batch window',
  daily: 'Daily digest',
}

interface DeliveryScheduleFieldsProps {
  form: UseFormReturn<z.input<typeof plexUserSchema>>
  disabled: boolean
}

/**
 * Per-user quiet hours and digest overrides. Every field can be left on
 * "Default", which inherits the admin setting from Notifications → General.
 */
export function DeliveryScheduleFields({
  form,
  disabled,
}: DeliveryScheduleFieldsProps) {
  const { config } = useConfig()
  const defaults = {
    ...DEFAULT_NOTIFICATION_DELIVERY,
    ...config?.notificationDelivery,
  }
  const defaultZone =
    defaults.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone

  const digestMode = form.watch('notify_digest_mode') ?? defaults.digestMode
  const quietOverride = form.watch('notify_quiet_hours_enabled')

  const defaultDigestLabel =
    defaults.digestMode === 'window'
      ? `${DIGEST_LABELS.window}, ${defaults.digestWindowMinutes} min`
      : defaults.digestMode === 'daily'
        ? `${DIGEST_LABELS.daily} at ${defaults.digestTime}`
        : DIGEST_LABELS.off
  const defaultQuietLabel = defaults.quietHoursEnabled
    ? `${defaults.quietHoursStart}–${defaults.quietHoursEnd}`
    : 'Off'

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-foreground">
          Availability Notification Schedule
        </h3>
        <p className="text-xs text-foreground/70">
          Applies to this user's "now available" notifications only.
        </p>
      </div>

      <FormField
        control={form.control}
        name="notify_digest_mode"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-foreground">Batching</FormLabel>
            <Select
              value={field.value ?? INHERIT}
              onValueChange={(value) =>
                field.onChange(value === INHERIT ? null : value)
              }
              disabled={disabled}
            >
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value={INHERIT}>
                  Default ({defaultDigestLabel})
                </SelectItem>
                <SelectItem value="off">Off (send immediately)</SelectItem>
                <SelectItem value="window">{DIGEST_LABELS.window}</SelectItem>
                <SelectItem value="daily">{DIGEST_LABELS.daily}</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      {digestMode === 'window' && (
        <FormField
          control={form.control}
          name="notify_digest_window_minutes"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-foreground">
                Batch Window (minutes)
              </FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  step={1}
                  placeholder={`Default (${defaults.digestWindowMinutes})`}
                  value={field.value?.toString() ?? ''}
                  onChange={(e) => {
                    const v = e.currentTarget.valueAsNumber
                    field.onChange(Number.isNaN(v) ? null : v)
                  }}
                  onBlur={field.onBlur}
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
          name="notify_digest_time"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-foreground">Digest Time</FormLabel>
              <FormControl>
                <Input
                  type="time"
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value || null)}
                  onBlur={field.onBlur}
                  disabled={disabled}
                />
              </FormControl>
              <FormDescription>
                Empty uses the default ({defaults.digestTime}).
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      <FormField
        control={form.control}
        name="notify_quiet_hours_enabled"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-foreground">Quiet Hours</FormLabel>
            <Select
              value={
                field.value === null || field.value === undefined
                  ? INHERIT
                  : field.value
                    ? 'on'
                    : 'off'
              }
              onValueChange={(value) =>
                field.onChange(value === INHERIT ? null : value === 'on')
              }
              disabled={disabled}
            >
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value={INHERIT}>
                  Default ({defaultQuietLabel})
                </SelectItem>
                <SelectItem value="on">On</SelectItem>
                <SelectItem value="off">Off</SelectItem>
              </SelectContent>
            </Select>
            <FormDescription>
              Notifications during quiet hours are held and sent as one digest
              when they end.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {quietOverride === true && (
        <div className="grid grid-cols-2 gap-4">
          {(
            [
              ['notify_quiet_hours_start', 'From', defaults.quietHoursStart],
              ['notify_quiet_hours_end', 'Until', defaults.quietHoursEnd],
            ] as const
          ).map(([name, label, fallback]) => (
            <FormField
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground">{label}</FormLabel>
                  <FormControl>
                    <Input
                      type="time"
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value || null)}
                      onBlur={field.onBlur}
                      disabled={disabled}
                    />
                  </FormControl>
                  <FormDescription>Default {fallback}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
        </div>
      )}

      <FormField
        control={form.control}
        name="notify_timezone"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-foreground">Time Zone</FormLabel>
            <FormControl>
              <TimeZoneInput
                name={field.name}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder={`Default (${defaultZone})`}
                disabled={disabled}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}

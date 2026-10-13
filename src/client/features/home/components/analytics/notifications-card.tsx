import { Webhook } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CardHeaderSkeleton } from '@/components/card-header-skeleton'
import { StatBar, StatBarList, StatBarSkeleton } from '@/components/stat-bar'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useNativeWebhookConfigured } from '@/features/home/hooks/useNativeWebhookConfigured'
import {
  channelRows,
  type FamilyGroup,
  groupNotificationTypes,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_FAMILIES,
} from '@/features/home/lib/notification-labels'
import { formatCount } from '@/lib/format'
import { NAV_PAGES, pageHref } from '@/lib/navigation'
import type { components } from '@/types/api.js'

type NotificationStats = components['schemas']['NotificationStats'] | undefined

function WebhookSetupLine() {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
      <Webhook className="size-4 shrink-0" />
      Only recorded when a native webhook is set up.
      <Button
        variant="link"
        size="sm"
        nativeButton={false}
        render={<Link to={pageHref(NAV_PAGES.webhooks)} />}
      >
        Set up native webhook
      </Button>
    </p>
  )
}

function TypeFamily({
  family,
  maxCount,
  webhookConfigured,
}: {
  family: FamilyGroup
  maxCount: number
  webhookConfigured: boolean
}) {
  const collapsed = !webhookConfigured && family.webhookOnly

  return (
    <StatBarList className="flex flex-col gap-3">
      <span className="text-xs font-medium text-muted-foreground">
        {family.label}
      </span>
      {collapsed ? (
        <WebhookSetupLine />
      ) : (
        family.rows.map((row) =>
          row.webhookOnly && !webhookConfigured ? (
            <div
              key={row.type}
              className="flex items-center justify-between gap-3 opacity-60"
            >
              <span className="truncate font-medium">{row.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                Webhook only
              </span>
            </div>
          ) : (
            <StatBar
              key={row.type}
              label={row.label}
              value={row.count}
              total={maxCount}
              color={row.color}
              showPercent={false}
            />
          ),
        )
      )}
    </StatBarList>
  )
}

function TypeFamiliesSkeleton() {
  return NOTIFICATION_FAMILIES.map((family) => (
    <div key={family.family} className="flex flex-col gap-3">
      <Skeleton className="h-3 w-24" />
      {family.types.map((type) => (
        <StatBarSkeleton key={type.type} />
      ))}
    </div>
  ))
}

export function NotificationsCard({ stats }: { stats: NotificationStats }) {
  const webhookConfigured = useNativeWebhookConfigured()
  const total = stats?.total_notifications ?? 0

  const grouped = stats ? groupNotificationTypes(stats.by_type) : null

  const types =
    webhookConfigured === undefined ? (
      <TypeFamiliesSkeleton />
    ) : (
      grouped?.families.map((family) => (
        <TypeFamily
          key={family.family}
          family={family}
          maxCount={grouped.maxCount}
          webhookConfigured={webhookConfigured}
        />
      ))
    )

  const content =
    !stats || total === 0 ? (
      <p className="text-muted-foreground">
        No notifications sent in this range.
      </p>
    ) : (
      <>
        <StatBarList className="flex flex-col gap-3">
          <span className="font-medium">Reached through</span>
          {channelRows(stats.by_channel).map(
            ({ channel, label, color, count }) => (
              <StatBar
                key={channel}
                label={label}
                value={count}
                total={total}
                color={color}
              />
            ),
          )}
          <p className="text-xs text-muted-foreground">
            One notification can go out on several channels, so these add up to
            more than 100%.
          </p>
        </StatBarList>
        <div className="flex flex-col gap-4">
          <span className="font-medium">What they were about</span>
          {types}
        </div>
      </>
    )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        {total > 0 && (
          <CardAction className="text-muted-foreground">
            {formatCount(total, 'notification')}
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="gap-5">{content}</CardContent>
    </Card>
  )
}

export function NotificationsCardSkeleton() {
  return (
    <Card>
      <CardHeaderSkeleton action={<Skeleton className="h-4 w-20" />} />
      <CardContent className="gap-5">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-28" />
          {NOTIFICATION_CHANNELS.map((channel) => (
            <StatBarSkeleton key={channel.channel} />
          ))}
          <Skeleton className="h-3 w-72 max-w-full" />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-4 w-40" />
          <TypeFamiliesSkeleton />
        </div>
      </CardContent>
    </Card>
  )
}

import { Loader2, Power } from 'lucide-react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usePlexMobileStatus } from '@/hooks/notifications/usePlexMobileStatus'
import { cn } from '@/lib/utils'
import { useConfigStore } from '@/stores/configStore'

interface PlexMobileFormProps {
  isInitialized: boolean
}

export function PlexMobileForm({ isInitialized }: PlexMobileFormProps) {
  const config = useConfigStore((state) => state.config)
  const updateConfig = useConfigStore((state) => state.updateConfig)
  const status = usePlexMobileStatus()

  const [isToggling, setIsToggling] = useState(false)

  const isEnabled = config?.plexMobileEnabled ?? false

  const handleToggle = useCallback(async () => {
    const newState = !isEnabled
    setIsToggling(true)
    try {
      if (newState && status === 'no_plex_pass') {
        toast.error(
          'Plex Pass is required for mobile push notifications. Please ensure your Plex account has an active Plex Pass subscription.',
        )
        return
      }

      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

      await Promise.all([
        updateConfig({ plexMobileEnabled: newState }),
        minimumLoadingTime,
      ])

      toast.success(
        `Plex mobile notifications ${newState ? 'enabled' : 'disabled'}`,
      )
    } catch {
      toast.error(
        `Failed to ${newState ? 'enable' : 'disable'} Plex mobile notifications`,
      )
    } finally {
      setIsToggling(false)
    }
  }, [isEnabled, status, updateConfig])

  const getStatusBadge = () => {
    if (status === 'unknown') return null

    const badgeColor = (() => {
      switch (status) {
        case 'enabled':
          return 'bg-green-500 hover:bg-green-500 text-black'
        case 'disabled':
        case 'no_plex_pass':
        case 'not_configured':
          return 'bg-red-500 hover:bg-red-500 text-black'
      }
    })()

    const label = (() => {
      switch (status) {
        case 'enabled':
          return 'Enabled'
        case 'disabled':
          return 'Disabled'
        case 'no_plex_pass':
          return 'No Plex Pass'
        case 'not_configured':
          return 'Not Configured'
      }
    })()

    return (
      <Badge
        variant="neutral"
        className={cn('px-2 py-0.5 h-7 text-sm', badgeColor)}
      >
        {label}
      </Badge>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-foreground">
          Plex Mobile Push Notifications
        </h3>
        {getStatusBadge()}
      </div>

      <div className="text-sm text-foreground p-3 bg-secondary-background rounded-base border-2 border-border">
        <p>
          {isEnabled
            ? 'Plex mobile push notifications are enabled. Users with Plex mobile apps will receive native push notifications when their content becomes available.'
            : 'Enable this feature to send native push notifications to users via the Plex mobile app when their requested content becomes available.'}
          {status === 'no_plex_pass' && (
            <span className="text-red-500 ml-1">
              Plex Pass is required for this feature.
            </span>
          )}
        </p>
      </div>

      <div className="flex items-center gap-4">
        <Button
          type="button"
          size="sm"
          onClick={handleToggle}
          disabled={isToggling || !isInitialized}
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
  )
}

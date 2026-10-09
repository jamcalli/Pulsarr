import { Loader2, ShieldCheck, Stethoscope } from 'lucide-react'
import * as React from 'react'
import { PageError } from '@/components/page-error'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { UtilitySectionHeader } from '@/components/utility-section-header'
import { WatchlistDiagnosticsResults } from '@/features/users/components/watchlist-diagnostics/watchlist-diagnostics-results'
import {
  useRunWatchlistDiagnostics,
  WatchlistDiagnosticsRequestError,
} from '@/features/users/hooks/watchlist-diagnostics/useWatchlistDiagnostics'
import { useConfig } from '@/hooks/useConfig'
import { useUserOptions } from '@/hooks/useUserOptions'

/** Mirrors the server's per-user cooldown so the button explains itself. */
const USER_COOLDOWN_SECONDS = 60

/**
 * Admin page that answers "why didn't this get added?" for one user by
 * comparing their live Plex watchlist with what Pulsarr has stored and routed.
 */
export function WatchlistDiagnosticsPage() {
  const { isInitialized, initialize, error: configError } = useConfig()
  const { options: userOptions, isLoading: usersLoading } = useUserOptions()
  const runDiagnostics = useRunWatchlistDiagnostics()
  const selectId = React.useId()

  const [userId, setUserId] = React.useState<string>('')
  const [cooldownUntil, setCooldownUntil] = React.useState<
    Record<string, number>
  >({})
  const [now, setNow] = React.useState(() => Date.now())

  const remainingSeconds = Math.max(
    0,
    Math.ceil(((cooldownUntil[userId] ?? 0) - now) / 1000),
  )

  React.useEffect(() => {
    if (remainingSeconds <= 0) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [remainingSeconds])

  const realUserOptions = userOptions.filter((option) => option.value !== '0')

  const handleRun = () => {
    if (!userId) return
    const selected = userId
    const startCooldown = (seconds: number) => {
      const startedAt = Date.now()
      setNow(startedAt)
      setCooldownUntil((current) => ({
        ...current,
        [selected]: startedAt + seconds * 1000,
      }))
    }
    runDiagnostics.mutate(Number(selected), {
      onSuccess: () => startCooldown(USER_COOLDOWN_SECONDS),
      onError: (error) => {
        if (
          error instanceof WatchlistDiagnosticsRequestError &&
          error.retryAfterSeconds
        ) {
          startCooldown(error.retryAfterSeconds)
        }
      },
    })
  }

  if (configError && !isInitialized) {
    return <PageError message={configError} onRetry={() => initialize(true)} />
  }

  const isRunning = runDiagnostics.isPending
  const result =
    runDiagnostics.data && String(runDiagnostics.data.user.id) === userId
      ? runDiagnostics.data
      : null
  const error =
    runDiagnostics.error && String(runDiagnostics.variables) === userId
      ? runDiagnostics.error
      : null

  return (
    <div>
      <UtilitySectionHeader
        title="Watchlist Diagnostics"
        description="Find out why a user's watchlist item was or was not added to Radarr or Sonarr"
        showStatus={false}
      />

      <div className="mt-6 space-y-6">
        <Alert variant="default">
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription>
            Read-only: a run fetches the user's live Plex watchlist and compares
            it with Pulsarr's records. Nothing is added, changed or routed. Runs
            are limited to one per user per minute to stay polite to Plex.
          </AlertDescription>
        </Alert>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-1">
            <label
              htmlFor={selectId}
              className="text-sm font-medium text-foreground"
            >
              User
            </label>
            <Select
              value={userId}
              onValueChange={setUserId}
              disabled={usersLoading || isRunning}
            >
              <SelectTrigger id={selectId} className="sm:w-72">
                <SelectValue
                  placeholder={
                    usersLoading ? 'Loading users...' : 'Pick a user'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {realUserOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            onClick={handleRun}
            disabled={!userId || isRunning || remainingSeconds > 0}
            className="h-10"
          >
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Stethoscope className="h-4 w-4" />
            )}
            <span className="ml-2">
              {isRunning
                ? 'Checking Plex...'
                : remainingSeconds > 0
                  ? `Run again in ${remainingSeconds}s`
                  : 'Run diagnostics'}
            </span>
          </Button>
        </div>

        {isRunning && (
          <p className="text-sm text-foreground/70">
            Large watchlists are fetched a page at a time with a pause between
            pages, so this can take a minute.
          </p>
        )}

        {error && !isRunning && (
          <Alert variant="error">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        {result && !isRunning && (
          <WatchlistDiagnosticsResults diagnostics={result} />
        )}
      </div>
    </div>
  )
}

export default WatchlistDiagnosticsPage

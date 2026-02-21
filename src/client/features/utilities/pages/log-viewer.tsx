import type { LogEntry } from '@root/schemas/logs/logs.schema.js'
import type { LogLevel as ConfigLogLevel } from '@root/types/config.types.js'
import {
  AlertCircle,
  CheckCircle,
  Download,
  Loader2,
  Pause,
  Play,
  Search,
  Trash2,
} from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { CopyButton } from '@/components/CopyButton'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { LogViewerPageSkeleton } from '@/features/utilities/components/log-viewer/log-viewer-page-skeleton'
import { useLogStream } from '@/features/utilities/hooks/useLogStream'
import { useInitializeWithMinDuration } from '@/hooks/useInitializeWithMinDuration'
import { useConfigStore } from '@/stores/configStore'

const LOG_LEVELS: { value: ConfigLogLevel; label: string }[] = [
  { value: 'trace', label: 'Trace' },
  { value: 'debug', label: 'Debug' },
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Warn' },
  { value: 'error', label: 'Error' },
  { value: 'fatal', label: 'Fatal' },
  { value: 'silent', label: 'Silent' },
]

const LOG_LEVEL_COLORS: Record<string, string> = {
  TRACE: 'text-gray-500 dark:text-gray-400',
  DEBUG: 'text-blue-600 dark:text-blue-400',
  INFO: 'text-green-600 dark:text-green-400',
  WARN: 'text-yellow-600 dark:text-yellow-400',
  ERROR: 'text-red-600 dark:text-red-400',
  FATAL: 'text-white bg-red-500 px-0.5 rounded-sm',
}

/**
 * Formats an ISO timestamp string to match the display format: yyyy-mm-dd HH:MM:ss +ZZZZ
 */
function formatLogTimestamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso

  const pad = (n: number) => String(n).padStart(2, '0')
  const year = d.getFullYear()
  const month = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  const hours = pad(d.getHours())
  const minutes = pad(d.getMinutes())
  const seconds = pad(d.getSeconds())

  // Timezone offset
  const offset = -d.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const absOffset = Math.abs(offset)
  const tzHours = pad(Math.floor(absOffset / 60))
  const tzMinutes = pad(absOffset % 60)

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} ${sign}${tzHours}${tzMinutes}`
}

/**
 * Formats a single data value for display, matching pino-pretty's style.
 * Strings get quoted, objects/arrays get compact JSON, primitives are bare.
 */
function formatDataValue(value: unknown): string {
  if (
    typeof value === 'string' ||
    (typeof value === 'object' && value !== null)
  )
    return JSON.stringify(value)
  return String(value)
}

/**
 * Reconstructs a human-readable log line from a structured LogEntry for export/copy.
 * Includes indented data fields below the message to match pino-pretty output.
 */
function formatLogEntryAsText(entry: LogEntry): string {
  const ts = formatLogTimestamp(entry.timestamp)
  const level = entry.level.toUpperCase()
  const mod = entry.module ? `[${entry.module}] ` : ''
  let line = `[${ts}] ${level}: ${mod}${entry.message}`

  if (entry.data) {
    for (const [key, value] of Object.entries(entry.data)) {
      line += `\n    ${key}: ${formatDataValue(value)}`
    }
  }

  return line
}

/**
 * Renders the extra data fields from a LogEntry as indented key-value lines,
 * matching pino-pretty's output style.
 */
function renderDataFields(data: Record<string, unknown>): React.ReactNode {
  return Object.entries(data).map(([key, value]) => (
    <div key={key} className="text-gray-500 dark:text-gray-400">
      {'    '}
      <span className="text-gray-600 dark:text-gray-300">{key}</span>
      {': '}
      <span className="text-gray-500 dark:text-gray-400">
        {formatDataValue(value)}
      </span>
    </div>
  ))
}

/**
 * Renders a structured LogEntry with colored spans matching terminal output.
 * Includes indented data fields below the message when present.
 */
function renderLogEntry(entry: LogEntry): React.ReactNode {
  const levelUpper = entry.level.toUpperCase()
  const levelColor = LOG_LEVEL_COLORS[levelUpper] || ''
  const ts = formatLogTimestamp(entry.timestamp)

  const messageLine = (
    <>
      <span className="text-gray-500 dark:text-gray-400">[{ts}]</span>{' '}
      <span className={levelColor}>{levelUpper}</span>
      <span className="text-gray-600 dark:text-gray-500">:</span>{' '}
      {entry.module && (
        <>
          <span className="text-fuchsia-600 dark:text-fuchsia-400">
            [{entry.module}]
          </span>{' '}
        </>
      )}
      <span className="text-cyan-700 dark:text-cyan-300">{entry.message}</span>
    </>
  )

  if (entry.data && Object.keys(entry.data).length > 0) {
    return (
      <>
        {messageLine}
        {renderDataFields(entry.data)}
      </>
    )
  }

  return messageLine
}

/**
 * Log Viewer utility page component that provides real-time log streaming with filtering and controls.
 *
 * Features terminal-style log display, level filtering, text search, connection management,
 * and export functionality. Follows the established utilities page patterns and styling.
 */
export function LogViewerPage() {
  const [textFilter, setTextFilter] = useState('')
  const [isAutoScroll, setIsAutoScroll] = useState(true)
  const [displayFilter, setDisplayFilter] = useState('')
  const [isToggling, setIsToggling] = useState(false)

  // Get config and update functions from store
  const { config, updateConfig, initialize, isInitialized } = useConfigStore()
  const currentLogLevel = config?.logLevel || 'info' // Default to 'info' if not set

  // Minimum loading duration for consistent UX
  const MIN_LOADING_DELAY = 500

  // Generate unique IDs for form elements
  const logLevelId = useId()
  const tailLinesId = useId()
  const textFilterId = useId()
  const autoScrollId = useId()

  // All hooks MUST be called before any conditional returns
  const {
    logs,
    isConnected,
    isConnecting,
    isPaused,
    error,
    pause,
    resume,
    clearLogs,
    updateOptions,
    options,
  } = useLogStream({
    tail: 100,
    follow: true,
  })

  // Initialize config store with minimum duration for consistent UX
  const isInitializing = useInitializeWithMinDuration(initialize)

  // Auto-scroll ref - MUST be before conditional return
  const logContainerRef = useRef<HTMLPreElement>(null)

  // Filter logs across level, module, message, and data fields
  const filteredLogs = logs.filter((log) => {
    if (!displayFilter) return true
    const lower = displayFilter.toLowerCase()
    if (log.level.toLowerCase().includes(lower)) return true
    if (log.module?.toLowerCase().includes(lower)) return true
    if (log.message.toLowerCase().includes(lower)) return true
    if (log.data) {
      const dataStr = JSON.stringify(log.data).toLowerCase()
      if (dataStr.includes(lower)) return true
    }
    return false
  })

  const logsText = filteredLogs
    .map((log) => formatLogEntryAsText(log))
    .join('\n\n')

  // Auto-scroll effect - MUST be before conditional return
  // Debounced to handle rapid log arrivals on initial load (100 logs via SSE)
  // Depends on isInitializing/isInitialized so it re-fires when skeleton goes away
  useEffect(() => {
    // Skip if skeleton is showing (ref won't be attached)
    if (isInitializing || !isInitialized) return

    if (filteredLogs.length > 0 && isAutoScroll && logContainerRef.current) {
      // Debounce: wait for logs to stop arriving, then scroll
      const timeoutId = setTimeout(() => {
        requestAnimationFrame(() => {
          if (logContainerRef.current) {
            logContainerRef.current.scrollTop =
              logContainerRef.current.scrollHeight
          }
        })
      }, 50)

      return () => clearTimeout(timeoutId)
    }
  }, [isAutoScroll, filteredLogs.length, isInitialized, isInitializing])

  // Helper function for minimum loading duration
  const setLoadingWithMinDuration = async (loadingFn: () => Promise<void>) => {
    const startTime = Date.now()
    setIsToggling(true)

    try {
      await loadingFn()
      const elapsed = Date.now() - startTime
      const remaining = Math.max(0, MIN_LOADING_DELAY - elapsed)

      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining))
      }
    } finally {
      setIsToggling(false)
    }
  }

  // Show skeleton during initialization - AFTER all hooks are called
  if (isInitializing || !isInitialized) {
    return <LogViewerPageSkeleton />
  }

  const handleTogglePause = async (shouldPause: boolean) => {
    await setLoadingWithMinDuration(async () => {
      if (shouldPause) {
        pause()
      } else {
        resume()
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    })
  }

  const handleLevelChange = async (level: ConfigLogLevel) => {
    await setLoadingWithMinDuration(async () => {
      try {
        // Update the global config log level (this updates runtime log level)
        await updateConfig({ logLevel: level })
      } catch (error) {
        console.error('Failed to update log level:', error)
        throw error
      }
    })
  }

  const handleTailChange = async (tail: string) => {
    const tailNum = parseInt(tail, 10)
    if (!Number.isNaN(tailNum) && tailNum >= 0) {
      await setLoadingWithMinDuration(async () => {
        updateOptions({ tail: tailNum })
        await new Promise((resolve) => setTimeout(resolve, 100))
      })
    }
  }

  const handleFilterApply = () => {
    setDisplayFilter(textFilter)
    updateOptions({ filter: textFilter || undefined })
  }

  const handleFilterClear = () => {
    setTextFilter('')
    setDisplayFilter('')
    updateOptions({ filter: undefined })
  }

  const exportLogs = () => {
    const blob = new Blob([logsText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pulsarr-logs-${new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:T]/g, '-')}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const getStreamingStatus = () => {
    if (error) return 'Error'
    if (isConnecting) return 'Connecting...'
    if (isPaused) return 'Paused'
    if (isConnected) return 'Live Streaming'
    return 'Connecting...'
  }

  return (
    <div>
      <UtilitySectionHeader
        title="Log Viewer"
        description="Real-time application log monitoring with filtering, level control, and export capabilities"
        showStatus={false}
      />

      <div className="mt-6 space-y-6">
        {/* Actions section */}
        <div>
          <h3 className="font-medium text-foreground mb-2">Actions</h3>
          <div className="flex flex-wrap items-center gap-4">
            <Button
              type="button"
              size="sm"
              onClick={() => handleTogglePause(!isPaused)}
              disabled={isConnecting || isToggling}
              variant={isPaused ? 'noShadow' : 'error'}
              className="h-8"
            >
              {isToggling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isPaused ? (
                <Play className="h-4 w-4" />
              ) : (
                <Pause className="h-4 w-4" />
              )}
              <span className="ml-2">
                {isToggling
                  ? isPaused
                    ? 'Resuming...'
                    : 'Pausing...'
                  : isPaused
                    ? 'Resume'
                    : 'Pause'}
              </span>
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={clearLogs}
              disabled={logs.length === 0 || isToggling}
              variant="noShadow"
              className="h-8"
            >
              <Trash2 className="h-4 w-4" />
              <span className="ml-2">Clear</span>
            </Button>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  onClick={exportLogs}
                  disabled={logsText.length === 0 || isToggling}
                  variant="noShadow"
                  className="h-8"
                >
                  <Download className="h-4 w-4" />
                  <span className="ml-2">Export</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Export currently displayed logs as text file</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <Separator />

        {/* Controls section */}
        <div>
          <h3 className="font-medium text-foreground mb-4">Log Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor={logLevelId} className="text-foreground">
                Log Level
              </Label>
              <Select
                value={currentLogLevel}
                onValueChange={handleLevelChange}
                disabled={isConnecting || !config || isToggling}
              >
                <SelectTrigger id={logLevelId}>
                  <SelectValue
                    placeholder={config ? undefined : 'Loading...'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {LOG_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      {level.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor={tailLinesId} className="text-foreground">
                Initial Lines
              </Label>
              <Select
                value={options.tail.toString()}
                onValueChange={handleTailChange}
                disabled={isConnecting || isToggling}
              >
                <SelectTrigger id={tailLinesId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">None</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                  <SelectItem value="500">500</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor={textFilterId} className="text-foreground">
                Filter Text
              </Label>
              <div className="flex gap-2">
                <Input
                  id={textFilterId}
                  value={textFilter}
                  onChange={(e) => setTextFilter(e.target.value)}
                  placeholder="Filter logs..."
                  onKeyDown={(e) => e.key === 'Enter' && handleFilterApply()}
                  className="flex-1"
                />
                {textFilter.trim() && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="noShadow"
                        onClick={handleFilterApply}
                        className="mt-0"
                        aria-label="Apply filter"
                      >
                        <Search className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Apply filter</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                {displayFilter && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="error"
                        onClick={handleFilterClear}
                        className="mt-0"
                        aria-label="Clear filter"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Clear filter</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Streaming status */}
        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md">
          <div className="flex items-center gap-2 mb-2">
            {error ? (
              <AlertCircle className="h-4 w-4 text-red-500" />
            ) : isPaused ? (
              <Pause className="h-4 w-4 text-yellow-500" />
            ) : isConnected ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
            )}
            <h3 className="font-medium text-foreground">Streaming Status</h3>
          </div>
          <p
            className={`text-sm mb-1 ${
              error
                ? 'text-red-600 dark:text-red-400'
                : isPaused
                  ? 'text-yellow-600 dark:text-yellow-400'
                  : isConnected
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-blue-600 dark:text-blue-400'
            }`}
          >
            {getStreamingStatus()}
          </p>
          <p className="text-sm text-foreground">
            Displaying {filteredLogs.length} log
            {filteredLogs.length === 1 ? '' : 's'}
            {displayFilter && ` (filtered by "${displayFilter}")`}
          </p>
          {error && (
            <p className="text-xs mt-1 text-red-600 dark:text-red-400 wrap-break-word">
              {error}
            </p>
          )}
        </div>
        <Separator />

        {/* Log display */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-foreground">Log Output</h3>
            <div className="flex items-center gap-2">
              <Checkbox
                id={autoScrollId}
                checked={isAutoScroll}
                onCheckedChange={(checked) => setIsAutoScroll(checked === true)}
              />
              <Label htmlFor={autoScrollId} className="text-sm text-foreground">
                Auto-scroll
              </Label>
            </div>
          </div>

          <div className="relative">
            <CopyButton
              text={logsText}
              size="icon"
              iconOnly
              disabled={logsText.length === 0}
              className="absolute top-2 right-2 md:right-6 z-10"
            />
            <pre
              ref={logContainerRef}
              role="log"
              aria-label="Application logs"
              // biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable content needs keyboard focus
              tabIndex={0}
              className="h-128 w-full overflow-auto whitespace-pre-wrap break-all font-base text-sm rounded-base border-2 border-border bg-secondary-background selection:bg-main selection:text-main-foreground px-3 py-2 text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
            >
              {filteredLogs.length > 0 ? (
                filteredLogs.map((log, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: logs are append-only, never reordered
                  <div key={index}>{renderLogEntry(log)}</div>
                ))
              ) : (
                <span className="text-muted-foreground">
                  {displayFilter && logs.length > 0
                    ? `No logs match filter "${displayFilter}"`
                    : isConnected && !isPaused
                      ? 'No logs yet...'
                      : isPaused
                        ? 'Paused - click Resume to continue streaming'
                        : 'Connecting to log stream...'}
                </span>
              )}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LogViewerPage

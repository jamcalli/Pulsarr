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
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
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

const formatTimestamp = (timestamp: string): string => {
  try {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', { hour12: false })
  } catch {
    return timestamp
  }
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll effect - MUST be before conditional return
  // biome-ignore lint/correctness/useExhaustiveDependencies: We need logsText to trigger auto-scroll on new logs
  useEffect(() => {
    if (isAutoScroll && textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight
    }
  }, [logs, isAutoScroll, displayFilter])

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

  // Convert logs to text for textarea
  const logsText = logs
    .filter((log) => {
      if (!displayFilter) return true
      return log.message.toLowerCase().includes(displayFilter.toLowerCase())
    })
    .map(
      (log) =>
        `[${formatTimestamp(log.timestamp)}] ${log.level.toUpperCase()}${
          log.module ? ` [${log.module}]` : ''
        }: ${log.message}`,
    )
    .join('\n')

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
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
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

            <TooltipProvider>
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
            </TooltipProvider>
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
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          size="icon"
                          variant="noShadow"
                          onClick={handleFilterApply}
                          className="mt-0"
                        >
                          <Search className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Apply filter</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {displayFilter && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          size="icon"
                          variant="error"
                          onClick={handleFilterClear}
                          className="mt-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Clear filter</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
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
            {logs.length} log
            {logs.length === 1 ? '' : 's'} received
            {displayFilter && ` (filtered by "${displayFilter}")`}
          </p>
          {error && (
            <p className="text-xs mt-1 text-red-600 dark:text-red-400 break-words">
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

          <Textarea
            ref={textareaRef}
            value={
              logsText ||
              (isConnected && !isPaused
                ? 'No logs yet...'
                : isPaused
                  ? 'Paused - click Resume to continue streaming'
                  : 'Connecting to log stream...')
            }
            readOnly
            className="h-[32rem] font-mono text-sm resize-none"
            placeholder="Logs will appear here when streaming..."
          />
        </div>
      </div>
    </div>
  )
}

export default LogViewerPage

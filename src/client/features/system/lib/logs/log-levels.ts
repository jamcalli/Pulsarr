import {
  ConfigLogLevelSchema,
  DEFAULT_LOG_LEVEL,
} from '@root/schemas/config/config.schema'
import type { LogLevel } from '@root/types/logs.types'
import type { BadgeVariant } from '@/components/ui/badge'
import type { components } from '@/types/api.js'

export type ConfigLogLevel = components['schemas']['ConfigLogLevel']

export const LOG_LEVEL_LABELS: Record<
  ConfigLogLevel,
  { label: string; description?: string }
> = {
  fatal: { label: 'Fatal', description: 'Only failures that stop Pulsarr.' },
  error: { label: 'Error' },
  warn: { label: 'Warn' },
  info: {
    label: 'Info',
    description: 'Everyday activity, plus warnings and failures.',
  },
  debug: { label: 'Debug', description: 'Detail for tracking down a problem.' },
  trace: { label: 'Trace', description: 'Every step, including each request.' },
  silent: { label: 'Silent' },
}

export const LOG_LEVEL_OPTIONS = ConfigLogLevelSchema.options.map((value) => ({
  value,
  ...LOG_LEVEL_LABELS[value],
}))

const VERBOSE_LEVELS: ReadonlySet<ConfigLogLevel> = new Set(['debug', 'trace'])

export function isVerboseLevel(level: ConfigLogLevel): boolean {
  return VERBOSE_LEVELS.has(level)
}

/** The level to suggest going back to, which is never a verbose or silent one. */
export function restoreLevel(
  previous: ConfigLogLevel,
  fallback: ConfigLogLevel = DEFAULT_LOG_LEVEL,
): ConfigLogLevel {
  return isVerboseLevel(previous) || previous === 'silent' ? fallback : previous
}

export const LEVEL_BADGE_VARIANTS: Record<LogLevel, BadgeVariant> = {
  fatal: 'destructive',
  error: 'destructive',
  warn: 'warn',
  info: 'ok',
  debug: 'info',
  trace: 'secondary',
}

const LEVEL_RANK: Record<LogLevel, number> = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
}

export type LevelThreshold = Extract<LogLevel, 'info' | 'warn' | 'error'>

export const LEVEL_FILTER_OPTIONS: ReadonlyArray<{
  value: LevelThreshold
  label: string
}> = [
  { value: 'info', label: 'Info or above' },
  { value: 'warn', label: 'Warn or above' },
  { value: 'error', label: 'Error or above' },
]

export function isAtOrAbove(level: LogLevel, threshold: LevelThreshold) {
  return LEVEL_RANK[level] <= LEVEL_RANK[threshold]
}

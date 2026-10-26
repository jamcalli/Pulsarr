import {
  MS_PER_HOUR,
  MS_PER_MINUTE,
  NEW_EPISODE_THRESHOLD_MS,
  QUEUE_WAIT_TIME_MS,
} from '@root/schemas/config/config.schema'

export function minutesToMs(minutes: number): number {
  return Math.round(minutes * MS_PER_MINUTE)
}

export function msToMinutes(milliseconds: number): number {
  return milliseconds / MS_PER_MINUTE
}

export function hoursToMs(hours: number): number {
  return Math.round(hours * MS_PER_HOUR)
}

export function msToHours(milliseconds: number): number {
  return milliseconds / MS_PER_HOUR
}

export const QUEUE_WAIT_MINUTES = {
  min: msToMinutes(QUEUE_WAIT_TIME_MS.min),
  max: msToMinutes(QUEUE_WAIT_TIME_MS.max),
}

export const NEW_EPISODE_THRESHOLD_HOURS = {
  min: msToHours(NEW_EPISODE_THRESHOLD_MS.min),
  max: msToHours(NEW_EPISODE_THRESHOLD_MS.max),
}

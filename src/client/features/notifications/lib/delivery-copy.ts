import { formatCount } from '@/lib/format'

export function queueWaitHelp(minutes: number | undefined): string {
  if (!minutes) return 'Sends each episode as soon as it is ready.'
  return `Waits ${formatCount(minutes, 'minute')} to group a show's episodes.`
}

export function newEpisodeThresholdHelp(hours: number | undefined): string {
  if (!hours) return 'Every episode waits to be grouped, however new.'
  return `Episodes aired in the last ${formatCount(hours, 'hour')} notify right away.`
}

export function availabilityHelp(on: boolean): string {
  return on
    ? 'Tells users on every channel when their content is ready.'
    : 'Off. Sonarr or Radarr tell users instead.'
}

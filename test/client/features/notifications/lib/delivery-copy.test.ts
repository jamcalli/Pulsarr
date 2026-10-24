import {
  availabilityHelp,
  newEpisodeThresholdHelp,
  queueWaitHelp,
} from '@/features/notifications/lib/delivery-copy'
import { setFormatLocale } from '@/lib/format'

describe('delivery copy', () => {
  beforeEach(() => setFormatLocale('en-US'))
  afterEach(() => setFormatLocale(undefined))

  it('describes the queue wait from its value', () => {
    expect(queueWaitHelp(0)).toBe('Sends each episode as soon as it is ready.')
    expect(queueWaitHelp(1)).toBe("Waits 1 minute to group a show's episodes.")
    expect(queueWaitHelp(5)).toBe("Waits 5 minutes to group a show's episodes.")
  })

  it('describes the new episode threshold from its value', () => {
    expect(newEpisodeThresholdHelp(0)).toBe(
      'Every episode waits to be grouped, however new.',
    )
    expect(newEpisodeThresholdHelp(48)).toBe(
      'Episodes aired in the last 48 hours notify right away.',
    )
  })

  it('describes availability on and off', () => {
    expect(availabilityHelp(true)).toBe(
      'Tells users on every channel when their content is ready.',
    )
    expect(availabilityHelp(false)).toBe(
      'Off. Sonarr or Radarr tell users instead.',
    )
  })
})

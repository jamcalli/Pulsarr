import { useState } from 'react'
import { toast } from 'sonner'
import { apiErrorMessage, apiFetch } from '@/lib/tanstackApi'
import { useConfigStore } from '@/stores/configStore'

export type RssStatus = 'idle' | 'loading' | 'success' | 'error'

/**
 * React hook for accessing and generating Plex RSS feed URLs.
 *
 * Provides the current RSS feed URLs, the status of the feed generation process, and a function to trigger RSS feed generation and refresh. The generation function enforces a minimum loading time and updates the feed URLs upon success or sets an error status if generation fails.
 *
 * @returns An object containing rssFeeds (current RSS feed URLs), rssStatus (generation status), and generateRssFeeds (function to generate and refresh RSS feeds)
 */
export function usePlexRssFeeds() {
  const config = useConfigStore((state) => state.config)
  const updateConfig = useConfigStore((state) => state.updateConfig)
  const [rssStatus, setRssStatus] = useState<RssStatus>('idle')

  const generateRssFeeds = async () => {
    setRssStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

      const [{ data, error: fetchError }] = await Promise.all([
        apiFetch.GET('/v1/plex/generate-rss-feeds'),
        minimumLoadingTime,
      ])
      if (fetchError) throw fetchError

      // Validate response payload before updating config
      const self = typeof data.self === 'string' ? data.self.trim() : ''
      const friends =
        typeof data.friends === 'string' ? data.friends.trim() : ''
      if (!self || !friends) {
        throw new Error('Invalid RSS response payload: missing feed URLs')
      }
      try {
        // Basic URL shape validation
        new URL(self)
        new URL(friends)
      } catch {
        throw new Error('Invalid RSS response payload: malformed feed URLs')
      }

      // Update RSS feeds in config
      await updateConfig({
        selfRss: self,
        friendsRss: friends,
      })

      setRssStatus('success')
      toast.success('RSS feed URLs have been successfully generated')
    } catch (error) {
      console.error('RSS generation error:', error)
      setRssStatus('error')
      toast.error(apiErrorMessage(error) ?? 'Failed to generate RSS feed URLs')
    }
  }

  // Properly type the RSS feeds data
  const rssFeeds: {
    selfRss: string
    friendsRss: string
  } = {
    selfRss: config?.selfRss || '',
    friendsRss: config?.friendsRss || '',
  }

  return {
    rssFeeds,
    rssStatus,
    generateRssFeeds,
  }
}

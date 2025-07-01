import { useState } from 'react'
import { toast } from 'sonner'
import { useConfigStore } from '@/stores/configStore'
import type { RssFeedsResponse } from '@root/schemas/plex/generate-rss-feeds.schema'

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
  const refreshRssFeeds = useConfigStore((state) => state.refreshRssFeeds)
  const [rssStatus, setRssStatus] = useState<RssStatus>('idle')

  const generateRssFeeds = async () => {
    setRssStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

      const [response] = await Promise.all([
        fetch('/v1/plex/generate-rss-feeds'),
        minimumLoadingTime,
      ])

      if (!response.ok) {
        throw new Error('Failed to generate RSS feeds')
      }

      // Parse the response as the correct schema type
      const data = (await response.json()) as RssFeedsResponse

      // Check if response has error
      if ('error' in data) {
        throw new Error(data.error || 'Failed to generate RSS feeds')
      }

      // Update RSS feeds in config through the configured action
      await refreshRssFeeds()

      setRssStatus('success')
      toast.success('RSS feed URLs have been successfully generated')
    } catch (error) {
      console.error('RSS generation error:', error)
      setRssStatus('error')
      toast.error('Failed to generate RSS feed URLs')
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

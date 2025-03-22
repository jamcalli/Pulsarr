import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { useConfigStore } from '@/stores/configStore'
import type { RssFeedsResponse } from '@root/schemas/plex/generate-rss-feeds.schema'

export type RssStatus = 'idle' | 'loading' | 'success' | 'error'

export function usePlexRssFeeds() {
  const { toast } = useToast()
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
      toast({
        title: 'RSS Feeds Generated',
        description: 'RSS feed URLs have been successfully generated',
        variant: 'default',
      })
    } catch (error) {
      console.error('RSS generation error:', error)
      setRssStatus('error')
      toast({
        title: 'Generation Failed',
        description: 'Failed to generate RSS feed URLs',
        variant: 'destructive',
      })
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

import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { useConfigStore } from '@/stores/configStore'

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

      await Promise.all([refreshRssFeeds(), minimumLoadingTime])

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

  return {
    rssFeeds: {
      selfRss: config?.selfRss || '',
      friendsRss: config?.friendsRss || '',
    },
    rssStatus,
    generateRssFeeds,
  }
}

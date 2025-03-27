import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useMediaQuery } from '@/hooks/use-media-query'

export const GenreRouteCardSkeleton = () => {
  const isMobile = useMediaQuery('(max-width: 768px)')

  return (
    <Card className="bg-bg">
      <div
        className={`flex items-center justify-between space-y-0 p-6 pb-2 ${
          isMobile ? 'flex-col items-start gap-4' : 'flex-row'
        }`}
      >
        <div className="flex items-center space-x-4">
          <Skeleton className="h-6 w-48" />
        </div>
        <div className={`flex space-x-2 ${isMobile ? 'w-full' : ''}`}>
          <Skeleton className="h-9 min-w-[5rem] flex-1" />
          <Skeleton className="h-9 min-w-[5rem] flex-1" />
        </div>
      </div>
      <CardContent>
        <div className="grid gap-4">
          {/* First Row */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Skeleton className="h-4 w-12" /> {/* Genre Label */}
              <Skeleton className="h-10 w-full" /> {/* Genre Select */}
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" /> {/* Sonarr Instance Label */}
              <Skeleton className="h-10 w-full" /> {/* Instance Select */}
            </div>
          </div>
          {/* Second Row */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" /> {/* Root Folder Label */}
              <Skeleton className="h-10 w-full" /> {/* Root Folder Select */}
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" /> {/* Quality Profile Label */}
              <Skeleton className="h-10 w-full" />{' '}
              {/* Quality Profile Select */}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default GenreRouteCardSkeleton

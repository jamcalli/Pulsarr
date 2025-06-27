import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { useMediaQuery } from '@/hooks/use-media-query'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export const SonarrPageSkeleton = () => {
  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground">Sonarr Instances</h2>
        <p className="text-sm text-foreground mt-1">
          Manage and configure your Sonarr instances for TV show automation
        </p>
      </div>

      <div className="grid gap-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-9 w-24" />
        </div>
        <InstanceCardSkeleton />
      </div>
    </div>
  )
}

const InstanceCardSkeleton = () => {
  const isMobile = useMediaQuery('(max-width: 768px)')

  return (
    <Card className="bg-background">
      <CardHeader
        className={`flex items-center justify-between space-y-0 pb-7 ${
          isMobile ? 'flex-col items-start gap-4' : 'flex-row'
        }`}
      >
        <div className="flex items-center space-x-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-5 w-16" />
        </div>
        <div className={`flex space-x-2 ${isMobile ? 'w-full' : ''}`}>
          <Skeleton className="h-9 min-w-[5rem] flex-1" />
          <Skeleton className="h-9 min-w-[5rem] flex-1" />
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Connection Settings Section */}
        <div className="space-y-4">
          <div className={`flex ${isMobile ? 'flex-col' : 'flex-row'} gap-4`}>
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-16" />
              <div className="flex gap-2">
                <Skeleton className="h-10 flex-1" />
                <Skeleton className="h-10 w-10" />
              </div>
            </div>
          </div>
        </div>

        {/* Profile Settings Section */}
        <div className={`flex ${isMobile ? 'flex-col' : 'flex-row'} gap-4`}>
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>

        {/* Instance Configuration Section */}
        <div className="grid lg:grid-cols-3 md:grid-cols-2 gap-4">
          {/* Monitor New Items */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </div>
            <div className="flex h-10 items-center gap-2 px-3 py-2">
              <Skeleton className="h-6 w-12 rounded-full" />
              <Skeleton className="h-4 w-36" />
            </div>
          </div>

          {/* Search on Add */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </div>
            <div className="flex h-10 items-center gap-2 px-3 py-2">
              <Skeleton className="h-6 w-12 rounded-full" />
              <Skeleton className="h-4 w-36" />
            </div>
          </div>

          {/* Instance Tags */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-10 w-10" />
              <Skeleton className="h-10 flex-1" />
            </div>
          </div>

          {/* Season Monitoring */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </div>
            <Skeleton className="h-10 w-full" />
          </div>

          {/* Series Type */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </div>
            <Skeleton className="h-10 w-full" />
          </div>

          {/* Sync With Instances */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-10" />
            </div>
          </div>

          {/* Default Instance */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <div className="flex h-10 items-center gap-2 px-3 py-2">
              <Skeleton className="h-6 w-12 rounded-full" />
              <Skeleton className="h-4 w-36" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default SonarrPageSkeleton

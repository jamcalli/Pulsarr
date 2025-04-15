import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useMediaQuery } from '@/hooks/use-media-query'

export const ContentRouteCardSkeleton = () => {
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
          {/* Conditions Section Header */}
          <div className="flex justify-between items-center">
            <Skeleton className="h-5 w-28" /> {/* Conditions Label */}
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-12" /> {/* Match text */}
              <Skeleton className="h-8 w-28 rounded-md" /> {/* AND/OR toggle */}
            </div>
          </div>

          {/* Conditions */}
          <div className="space-y-3">
            {/* Condition 1 */}
            <div className="p-3 border rounded-md">
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[150px]">
                  <Skeleton className="h-3 w-16 mb-1" /> {/* Field label */}
                  <Skeleton className="h-10 w-full" /> {/* Field select */}
                </div>
                <div className="flex-1 min-w-[150px]">
                  <Skeleton className="h-3 w-16 mb-1" /> {/* Operator label */}
                  <Skeleton className="h-10 w-full" /> {/* Operator select */}
                </div>
                <div className="flex-[2] min-w-[200px]">
                  <Skeleton className="h-3 w-16 mb-1" /> {/* Value label */}
                  <Skeleton className="h-10 w-full" /> {/* Value input */}
                </div>
                <div className="flex items-end space-x-1 pb-1">
                  <Skeleton className="h-9 w-12" /> {/* NOT button */}
                  <Skeleton className="h-9 w-9" /> {/* Delete button */}
                </div>
              </div>
            </div>

            {/* Condition 2 */}
            <div className="p-3 border rounded-md">
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[150px]">
                  <Skeleton className="h-3 w-16 mb-1" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="flex-1 min-w-[150px]">
                  <Skeleton className="h-3 w-16 mb-1" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="flex-[2] min-w-[200px]">
                  <Skeleton className="h-3 w-16 mb-1" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="flex items-end space-x-1 pb-1">
                  <Skeleton className="h-9 w-12" />
                  <Skeleton className="h-9 w-9" />
                </div>
              </div>
            </div>

            {/* Add Condition Button */}
            <Skeleton className="h-9 w-full" />
          </div>

          {/* Priority Slider */}
          <div>
            <div className="flex justify-between mb-1">
              <Skeleton className="h-4 w-28" /> {/* Label */}
              <Skeleton className="h-4 w-8" /> {/* Value */}
            </div>
            <Skeleton className="h-4 w-full mb-1" /> {/* Slider */}
            <Skeleton className="h-3 w-64" /> {/* Description */}
          </div>

          {/* Instance and Root Folder */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" /> {/* Label */}
              <Skeleton className="h-10 w-full" /> {/* Select */}
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" /> {/* Label */}
              <Skeleton className="h-10 w-full" /> {/* Select */}
            </div>
          </div>

          {/* Quality Profile */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" /> {/* Label */}
            <Skeleton className="h-10 w-full" /> {/* Select */}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default ContentRouteCardSkeleton

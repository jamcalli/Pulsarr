import { useEffect, useState } from 'react'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export const InstanceCardSkeleton = ({ minLoadTime = 500 }) => {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false)
    }, minLoadTime)

    return () => clearTimeout(timer)
  }, [minLoadTime])

  if (!isVisible) return null

  return (
    <Card className="bg-bg">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-7">
        <div className="flex items-center space-x-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-5 w-16" />
        </div>
        <div className="flex space-x-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-20" />
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Connection Settings Section */}
        <div className="space-y-4">
          <div className="flex portrait:flex-col gap-4">
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
        <div className="flex portrait:flex-col gap-4">
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
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <div className="flex h-10 items-center gap-2 px-3 py-2">
              <Skeleton className="h-5 w-10" />
              <Skeleton className="h-4 w-36" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default InstanceCardSkeleton

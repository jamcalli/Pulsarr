import { Skeleton } from '@/components/ui/skeleton'

interface UserAvatarSkeletonProps {
  size?: 'sm' | 'lg'
  showText?: boolean
  className?: string
}

export function UserAvatarSkeleton({ 
  size = 'sm', 
  showText = true,
  className 
}: UserAvatarSkeletonProps) {
  const avatarSize = size === 'lg' ? 'h-8 w-8' : 'h-8 w-8'
  
  return (
    <div className={`flex items-center gap-2 ${className || ''}`}>
      <Skeleton className={`${avatarSize} rounded-full`} />
      {showText && (
        <div className="grid flex-1 text-left">
          <Skeleton className="h-4 w-20 mb-1" />
          {size === 'lg' && <Skeleton className="h-3 w-32" />}
        </div>
      )}
    </div>
  )
}
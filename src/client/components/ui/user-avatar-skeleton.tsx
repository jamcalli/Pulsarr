import { Skeleton } from '@/components/ui/skeleton'

interface UserAvatarSkeletonProps {
  size?: 'sm' | 'lg'
  showText?: boolean
  className?: string
}

/**
 * Renders a skeleton placeholder for a user avatar with optional text lines.
 *
 * Displays a circular avatar skeleton and, if `showText` is true, one or two rectangular skeleton bars to represent user information. The number of text bars depends on the `size` prop.
 *
 * @param size - Determines the avatar and text skeleton size; `'sm'` or `'lg'`. Defaults to `'sm'`.
 * @param showText - Whether to display text skeletons next to the avatar. Defaults to `true`.
 * @param className - Additional CSS classes for the container.
 * @returns A React element representing the avatar skeleton UI.
 */
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
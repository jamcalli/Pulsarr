import type { ComponentProps } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'

type AvatarSize = ComponentProps<typeof Avatar>['size']

interface UserAvatarProps {
  name: string
  avatar?: string | null
  size?: AvatarSize
  className?: string
}

export function UserAvatar({ name, avatar, size, className }: UserAvatarProps) {
  return (
    <Avatar size={size} className={className}>
      {avatar && <AvatarImage src={avatar} alt="" />}
      <AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback>
    </Avatar>
  )
}

export function UserAvatarSkeleton({ size }: { size?: AvatarSize }) {
  return (
    <Avatar size={size}>
      <Skeleton className="size-full rounded-full" />
    </Avatar>
  )
}

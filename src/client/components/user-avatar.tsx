import type { ComponentProps } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

interface UserAvatarProps {
  name: string
  avatar?: string | null
  size?: ComponentProps<typeof Avatar>['size']
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

import { cn } from 'cn'
import type { ComponentProps } from 'react'
import { Item } from '@/components/ui/item'
import { useIntent } from '@/hooks/useIntent'

type ItemButtonProps = Omit<
  ComponentProps<typeof Item>,
  'render' | 'onClick'
> & {
  onClick: () => void
  onIntent?: () => void
}

export function ItemButton({
  className,
  onClick,
  onIntent,
  ...props
}: ItemButtonProps) {
  const intent = useIntent(onIntent)
  return (
    <Item
      {...props}
      className={cn('flex-nowrap px-2 text-left hover:bg-accent', className)}
      render={<button type="button" onClick={onClick} {...intent} />}
    />
  )
}

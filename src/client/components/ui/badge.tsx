import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from 'cn'

const badgeVariants = cva(
  'group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border-2 border-transparent px-2 py-0.5 text-xs font-bold whitespace-nowrap transition-all outline-foreground/50 focus-visible:outline-3 focus-visible:outline-offset-0 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive [&>svg]:pointer-events-none [&>svg]:size-3!',
  {
    variants: {
      variant: {
        default: 'border-border bg-primary text-primary-foreground',
        secondary: 'border-border bg-accent text-foreground',
        destructive: 'border-border bg-destructive text-primary-foreground',
        outline: 'border-border bg-card text-foreground',
        warn: 'border-border bg-status-pending text-primary-foreground',
        ghost: 'text-muted-foreground hover:bg-accent hover:text-foreground',
        link: 'text-foreground underline underline-offset-4 hover:no-underline',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({
  className,
  variant = 'default',
  render,
  ...props
}: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props,
    ),
    render,
    state: {
      slot: 'badge',
      variant,
    },
  })
}

export { Badge, badgeVariants }

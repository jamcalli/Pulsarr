import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from 'cn'

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border-2 border-transparent bg-clip-padding text-sm font-bold whitespace-nowrap transition-all select-none outline-foreground/50 focus-visible:outline-3 focus-visible:outline-offset-0 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'border-border bg-clip-border bg-primary text-primary-foreground shadow-shadow active:translate-x-boxShadowX active:translate-y-boxShadowY active:shadow-none',
        warn: 'border-border bg-clip-border bg-gold text-primary-foreground',
        neutral:
          'border-border bg-clip-border bg-inset text-foreground hover:bg-accent aria-expanded:bg-accent',
        ghost:
          'text-muted-foreground hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground',
        outline:
          'border-border bg-clip-border bg-inset text-foreground shadow-shadow active:translate-x-boxShadowX active:translate-y-boxShadowY active:shadow-none aria-expanded:bg-accent',
        secondary:
          'bg-surface text-foreground hover:bg-accent aria-expanded:bg-accent',
        destructive:
          'border-border bg-clip-border bg-destructive text-primary-foreground shadow-shadow active:translate-x-boxShadowX active:translate-y-boxShadowY active:shadow-none',
        link: 'text-foreground underline underline-offset-4 hover:no-underline',
      },
      size: {
        default:
          'h-10 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-8 gap-1 px-3 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        lg: 'h-10 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        icon: 'size-9',
        'icon-xs': "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8 rounded-md',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

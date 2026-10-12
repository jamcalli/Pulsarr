import { cn } from 'cn'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { CardFrame } from '@/components/card-frame'
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Separator } from '@/components/ui/separator'

interface AccordionCardProps {
  /** `new` marks an unsaved card, whose trigger cancels it and shows a close icon. */
  value: number | 'new'
  title: string
  muted?: boolean
  badges?: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
  summary?: ReactNode
  footer?: ReactNode
  open: boolean
  onToggle: () => void
  children?: ReactNode
}

export function AccordionCard({
  value,
  title,
  muted = false,
  badges,
  leading,
  trailing,
  summary,
  footer,
  open,
  onToggle,
  children,
}: AccordionCardProps) {
  const cancels = value === 'new'
  const triggerLabel = cancels
    ? 'Cancel adding'
    : open
      ? `Collapse ${title}`
      : `Edit ${title}`
  const cancelIcon = cancels ? (
    <X
      data-slot="accordion-trigger-icon"
      className="pointer-events-none shrink-0"
    />
  ) : undefined

  return (
    <AccordionItem
      value={value}
      className="not-last:border-b-0"
      onOpenChange={onToggle}
    >
      <CardFrame>
        <section
          aria-label={title}
          className="flex flex-col gap-(--card-spacing)"
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3.5">
              {leading}
              <div className="min-w-0 flex-1">
                <AccordionTrigger
                  aria-label={triggerLabel}
                  className="gap-3.5 **:data-[slot=accordion-trigger-icon]:mt-1"
                  icon={cancelIcon}
                >
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'font-heading text-base font-medium break-words',
                          muted && 'text-muted-foreground',
                        )}
                      >
                        {title}
                      </span>
                      {badges}
                    </span>
                    {summary}
                  </span>
                </AccordionTrigger>
              </div>
              {trailing && (
                <div className="flex shrink-0 items-center gap-2">
                  {trailing}
                </div>
              )}
            </div>
            {footer}
          </div>
          <AccordionContent className="flex flex-col gap-(--card-spacing)">
            <Separator />
            {children}
          </AccordionContent>
        </section>
      </CardFrame>
    </AccordionItem>
  )
}

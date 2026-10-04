import { cn } from 'cn'
import { ArrowUpCircle, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import pulsarrLogo from '@/assets/images/pulsarr.svg'
import { ReleaseNotes } from '@/components/release-notes'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { SidebarHeader } from '@/components/ui/sidebar'
import { useAvailableUpdate } from '@/hooks/useAvailableUpdate'
import { formatDate } from '@/lib/format'
import { NAV_PAGES, pageHref } from '@/lib/navigation'
import type { AvailableUpdate } from '@/lib/update-status'

function UpdatePopover({ update }: { update: AvailableUpdate }) {
  const title = `v${update.latestVersion} available`
  const released = update.publishedAt
    ? ` Released ${formatDate(new Date(update.publishedAt))}.`
    : ''

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="warn" size="xs" />}>
        <ArrowUpCircle data-icon="inline-start" />
        Update
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-(--available-height) w-110 max-w-(--available-width) gap-3"
      >
        <PopoverHeader>
          <PopoverTitle className="text-base">{title}</PopoverTitle>
          <PopoverDescription className="text-xs">
            You're running v{__APP_VERSION__}.{released}
          </PopoverDescription>
        </PopoverHeader>
        {update.releaseBodyHtml && (
          <ReleaseNotes
            html={update.releaseBodyHtml}
            className="min-h-0 flex-1"
          />
        )}
        <a
          href={update.releaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            buttonVariants({ variant: 'link', size: 'sm' }),
            'self-start px-0',
          )}
        >
          View release on GitHub
          <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
        </a>
      </PopoverContent>
    </Popover>
  )
}

export function SidebarLogo() {
  const update = useAvailableUpdate()

  return (
    <SidebarHeader className="h-16 shrink-0 flex-row items-center gap-2.5 border-b-2 border-border bg-primary py-0 pr-3.5 pl-4.5 text-primary-foreground">
      <Link
        to={pageHref(NAV_PAGES.dashboard)}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-sm outline-foreground/50 focus-visible:outline-3 focus-visible:outline-offset-0"
      >
        <img src={pulsarrLogo} alt="" className="size-7.5 shrink-0" />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-heading text-lg leading-none font-bold tracking-tight">
            Pulsarr
          </span>
          <span className="text-xs leading-none tabular-nums">
            v{__APP_VERSION__}
          </span>
        </span>
      </Link>
      {update && <UpdatePopover update={update} />}
    </SidebarHeader>
  )
}

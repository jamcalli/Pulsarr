import { cn } from 'cn'
import { ArrowUpCircle, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import pulsarrLogo from '@/assets/images/pulsarr.svg'
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
import { NAV_PAGES, pageHref } from '@/lib/navigation'
import type { AvailableUpdate } from '@/lib/update-status'

function UpdatePopover({ update }: { update: AvailableUpdate }) {
  const title = `${update.releaseName ?? `v${update.latestVersion}`} available`
  const released = update.publishedAt
    ? ` Released ${new Date(update.publishedAt).toLocaleDateString()}.`
    : ''

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="warn" size="xs" />}>
        <ArrowUpCircle data-icon="inline-start" />
        Update
      </PopoverTrigger>
      <PopoverContent align="start" className="w-85 max-w-[90vw] gap-3">
        <PopoverHeader>
          <PopoverTitle className="text-base">{title}</PopoverTitle>
          <PopoverDescription className="text-xs">
            You're running v{__APP_VERSION__}.{released}
          </PopoverDescription>
        </PopoverHeader>
        {update.releaseBodyHtml && (
          <div
            className="max-h-55 overflow-y-auto rounded-md border-2 border-border bg-inset px-3 py-2.5 text-sm [&_a]:underline [&_code]:rounded-sm [&_code]:bg-chip [&_code]:px-1 [&_code]:font-mono [&_h1]:my-1 [&_h1]:font-bold [&_h2]:my-1 [&_h2]:font-bold [&_h3]:my-1 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-muted [&_li]:ml-4 [&_li]:list-disc [&_p]:my-1 [&_pre]:overflow-x-auto [&_pre]:rounded-sm [&_pre]:bg-chip [&_pre]:p-2 [&_ul]:my-1"
            dangerouslySetInnerHTML={{ __html: update.releaseBodyHtml }}
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
    <SidebarHeader className="h-16 shrink-0 flex-row items-center gap-2.5 border-b-2 border-border bg-main py-0 pr-3.5 pl-4.5 text-main-foreground">
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

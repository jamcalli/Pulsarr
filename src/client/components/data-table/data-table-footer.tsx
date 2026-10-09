import type { MouseEvent } from 'react'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { formatNumber } from '@/lib/format'

interface DataTableFooterProps {
  /** One-based. */
  page: number
  pageSize: number
  total: number
  pageHref: (page: number) => string
  onPageChange: (page: number) => void
}

function pageLink(
  target: number,
  enabled: boolean,
  pageHref: (page: number) => string,
  onPageChange: (page: number) => void,
) {
  if (!enabled) return { 'aria-disabled': true }
  return {
    href: pageHref(target),
    onClick: (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault()
      onPageChange(target)
    },
  }
}

/** Hidden while every row fits on one page. */
export function DataTableFooter({
  page,
  pageSize,
  total,
  pageHref,
  onPageChange,
}: DataTableFooterProps) {
  const pageCount = Math.ceil(total / pageSize)
  if (pageCount <= 1) return null
  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-muted-foreground tabular-nums">
        {formatNumber(first)} to {formatNumber(last)} of {formatNumber(total)}
      </span>
      <Pagination className="mx-0 w-auto">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              {...pageLink(page - 1, page > 1, pageHref, onPageChange)}
            />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              {...pageLink(page + 1, page < pageCount, pageHref, onPageChange)}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  )
}

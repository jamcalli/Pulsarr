import type { MouseEvent } from 'react'
import { CompactSelect } from '@/components/compact-select'
import { PAGE_SIZES, type PageSize } from '@/components/data-table/page-size'
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
  pageSize: PageSize
  total: number
  pageHref: (page: number) => string
  onPageChange: (page: number) => void
  onPageSizeChange: (size: PageSize) => void
}

const PAGE_SIZE_OPTIONS = PAGE_SIZES.map((size) => ({
  value: size,
  label: `${formatNumber(size)} per page`,
}))

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

/** Hidden while every row fits on the smallest page size. */
export function DataTableFooter({
  page,
  pageSize,
  total,
  pageHref,
  onPageChange,
  onPageSizeChange,
}: DataTableFooterProps) {
  if (total <= PAGE_SIZES[0]) return null
  const pageCount = Math.ceil(total / pageSize)
  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-muted-foreground tabular-nums">
        {formatNumber(first)} to {formatNumber(last)} of {formatNumber(total)}
      </span>
      <div className="flex items-center gap-2">
        <CompactSelect
          label="Rows per page"
          value={pageSize}
          options={PAGE_SIZE_OPTIONS}
          onValueChange={onPageSizeChange}
        />
        <Pagination className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                {...pageLink(page - 1, page > 1, pageHref, onPageChange)}
              />
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                {...pageLink(
                  page + 1,
                  page < pageCount,
                  pageHref,
                  onPageChange,
                )}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  )
}

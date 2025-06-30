import * as React from 'react'
import { Check, ListFilter } from 'lucide-react'
import type { Column, Row } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'

interface DataTableFacetedFilterProps<TData, TValue> {
  column?: Column<TData, TValue>
  title?: string
  icon?: React.ComponentType<{ className?: string }>
  options: {
    label: string
    value: string
    icon?: React.ComponentType<{ className?: string }>
  }[]
  filterFn?: (
    row: Row<TData>,
    columnId: string,
    filterValue: string[],
  ) => boolean
  showSearch?: boolean
}

/**
 * Renders a faceted filter popover for a data table column, allowing users to filter rows by selecting one or more options from a searchable list.
 *
 * Displays a filter button with an icon, title, and badges indicating selected filters. When opened, shows a popover containing selectable filter options, each with an optional icon and count of matching rows. Supports custom filter logic and provides an option to clear all selected filters.
 *
 * @param column - The table column to apply the filter to.
 * @param title - The title displayed on the filter button and as the input placeholder.
 * @param icon - Optional icon component for the filter button; defaults to a filter icon.
 * @param options - Array of filter options, each with a label, value, and optional icon.
 * @param filterFn - Optional custom filter function to override the column's default filtering logic.
 * @param showSearch - If true, displays a search input for filtering options within the popover.
 *
 * @template TData - The type of the table data.
 * @template TValue - The type of the filter option values.
 */
export function DataTableFacetedFilter<TData, TValue>({
  column,
  title,
  icon: FilterIcon = ListFilter,
  options,
  filterFn,
  showSearch = false,
}: DataTableFacetedFilterProps<TData, TValue>) {
  const facets = column?.getFacetedUniqueValues()
  const selectedValues = new Set(column?.getFilterValue() as string[])
  const [isOpen, setIsOpen] = React.useState(false)

  // Set custom filter function if provided
  React.useEffect(() => {
    if (filterFn && column) {
      const originalFilterFn = column.columnDef.filterFn
      column.columnDef.filterFn = filterFn
      return () => {
        column.columnDef.filterFn = originalFilterFn
      }
    }
  }, [filterFn, column])

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="noShadow" size="sm" className="h-10">
          <FilterIcon className="mr-2 h-4 w-4" />
          {title}
          {selectedValues?.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-2 h-4" />
              {selectedValues.size > 1 ? (
                <Badge
                  variant="neutral"
                  className="rounded-xs px-1 font-normal"
                >
                  {selectedValues.size} selected
                </Badge>
              ) : (
                <div className="flex space-x-1">
                  {options
                    .filter((option) => selectedValues.has(option.value))
                    .map((option) => (
                      <Badge
                        variant="neutral"
                        key={option.value}
                        className="rounded-xs px-1 font-normal"
                      >
                        {option.label}
                      </Badge>
                    ))}
                </div>
              )}
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command className="border-none rounded-base">
          {showSearch && (
            <CommandInput placeholder={title} className="border-0" />
          )}
          <CommandList className="max-h-[300px] overflow-y-auto p-0">
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selectedValues.has(option.value)
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => {
                      if (isSelected) {
                        selectedValues.delete(option.value)
                      } else {
                        selectedValues.add(option.value)
                      }
                      const filterValues = Array.from(selectedValues)
                      column?.setFilterValue(
                        filterValues.length ? filterValues : undefined,
                      )
                    }}
                  >
                    <div
                      className={cn(
                        'mr-2 flex h-4 w-4 items-center justify-center rounded-xs border border-primary',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'opacity-50 [&_svg]:invisible',
                      )}
                    >
                      <Check className={cn('h-4 w-4')} />
                    </div>
                    {option.icon && (
                      <option.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                    )}
                    <span>{option.label}</span>
                    {facets?.get(option.value) && (
                      <span className="ml-auto flex h-4 w-4 items-center justify-center font-mono text-xs">
                        {facets.get(option.value)}
                      </span>
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {selectedValues.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => column?.setFilterValue(undefined)}
                    className="justify-center text-center"
                  >
                    Clear filters
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import {
  CheckIcon,
  XCircle,
  ChevronDown,
  X,
  WandSparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'

const multiSelectVariants = cva('m-1', {
  variants: {
    variant: {
      default: 'border-border text-foreground bg-background hover:bg-accent',
      secondary:
        'border-foreground/10 bg-secondary text-secondary-foreground hover:bg-secondary/80',
      destructive:
        'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
      inverted: 'inverted',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

interface Option {
  label: string
  value: string
  icon?: React.ComponentType<{ className?: string }>
}

interface OptionGroup {
  label: string
  options: Option[]
}

interface MultiSelectProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof multiSelectVariants> {
  options: Option[] | OptionGroup[]
  onValueChange: (value: string[]) => void
  value?: string[]
  defaultValue?: string[]
  placeholder?: string
  animation?: number
  maxCount?: number
  modalPopover?: boolean
  asChild?: boolean
  className?: string
  onDropdownOpen?: () => Promise<void>
}

export const MultiSelect = React.forwardRef<
  HTMLButtonElement,
  MultiSelectProps
>(
  (
    {
      options,
      onValueChange,
      variant,
      value,
      defaultValue = [],
      placeholder = 'Select options',
      animation = 0,
      maxCount = 3,
      modalPopover = false,
      asChild = false,
      className,
      onDropdownOpen,
      ...props
    },
    ref,
  ) => {
    // Use value prop if present, otherwise use defaultValue
    const [selectedValues, setSelectedValues] =
      React.useState<string[]>(value || defaultValue)
    const [isPopoverOpen, setIsPopoverOpen] = React.useState(false)
    const [isAnimating, setIsAnimating] = React.useState(false)
      
    // Update internal state when value prop changes
    React.useEffect(() => {
      if (value !== undefined) {
        setSelectedValues(value)
      }
    }, [value])

    // Detect if options are grouped by checking the first element
    const isGrouped = React.useMemo(() => {
      if (!Array.isArray(options) || options.length === 0) {
        return false;
      }
      
      const firstOption = options[0];
      return (
        typeof firstOption === 'object' &&
        firstOption !== null &&
        'options' in firstOption &&
        Array.isArray((firstOption as OptionGroup).options)
      );
    }, [options])

    // Create a flat list of all options for badge display and selection checks
    const flatOptions = React.useMemo(() => {
      // Safe type checking to determine if we have grouped options
      const firstOption = options[0] as unknown
      if (
        firstOption &&
        typeof firstOption === 'object' &&
        'options' in firstOption &&
        Array.isArray((firstOption as OptionGroup).options)
      ) {
        return (options as OptionGroup[]).flatMap((group) => group.options)
      }
      return options as Option[]
    }, [options])

    const handleInputKeyDown = (
      event: React.KeyboardEvent<HTMLInputElement>,
    ) => {
      if (event.key === 'Enter') {
        setIsPopoverOpen(true)
      } else if (event.key === 'Backspace' && !event.currentTarget.value) {
        const newSelectedValues = [...selectedValues]
        newSelectedValues.pop()
        setSelectedValues(newSelectedValues)
        onValueChange(newSelectedValues)
      }
    }

    const toggleOption = (option: string) => {
      const newSelectedValues = selectedValues.includes(option)
        ? selectedValues.filter((value) => value !== option)
        : [...selectedValues, option]
      setSelectedValues(newSelectedValues)
      onValueChange(newSelectedValues)
    }

    const handleClear = () => {
      setSelectedValues([])
      onValueChange([])
    }

    const handleTogglePopover = () => {
      if (!props.disabled) {
        setIsPopoverOpen((prev) => !prev)
      }
    }

    const clearExtraOptions = () => {
      const newSelectedValues = selectedValues.slice(0, maxCount)
      setSelectedValues(newSelectedValues)
      onValueChange(newSelectedValues)
    }

    const toggleAll = () => {
      // Use a Set to deduplicate values
      const uniqueOptionValues = Array.from(new Set(flatOptions.map(o => o.value)))
      
      // Check if all available options are currently selected
      const allSelected = uniqueOptionValues.every((val) => 
        selectedValues.includes(val)
      )

      if (allSelected) {
        handleClear()
      } else {
        setSelectedValues(uniqueOptionValues)
        onValueChange(uniqueOptionValues)
      }
    }

    return (
      <Popover
        open={isPopoverOpen}
        onOpenChange={async (open) => {
          if (open && onDropdownOpen) {
            try {
              await onDropdownOpen()
            } catch (err) {
              console.error('[MultiSelect] onDropdownOpen failed', err)
            }
          }
          setIsPopoverOpen(open)
        }}
        modal={modalPopover}
      >
        <PopoverTrigger asChild>
          <Button
            variant="noShadow"
            ref={ref}
            {...props}
            onClick={handleTogglePopover}
            className={cn(
              'flex w-full p-1 rounded-md h-10 items-center justify-between [&_svg]:pointer-events-auto overflow-hidden',
              props.disabled && 'cursor-not-allowed! pointer-events-none opacity-50',
              className,
            )}
          >
            {selectedValues.length > 0 ? (
              <div className="flex justify-between items-center w-full">
                <div className="flex items-center overflow-hidden flex-nowrap">
                  {selectedValues.slice(0, maxCount).map((value) => {
                    const option = flatOptions.find((o) => o.value === value)
                    const IconComponent = option?.icon
                    return (
                      <Badge
                        key={value}
                        className={cn(
                          'whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px]',
                          isAnimating ? 'animate-bounce' : '',
                          multiSelectVariants({ variant }),
                        )}
                        style={{ animationDuration: `${animation}s` }}
                      >
                        {IconComponent && (
                          <IconComponent className="h-4 w-4 mr-2" />
                        )}
                        {option?.label}
                        <XCircle
                          className={cn(
                            "ml-2 h-4 w-4",
                            props.disabled ? "cursor-not-allowed" : "cursor-pointer"
                          )}
                          onClick={(event) => {
                            event.stopPropagation()
                            if (!props.disabled) {
                              toggleOption(value)
                            }
                          }}
                        />
                      </Badge>
                    )
                  })}
                  {selectedValues.length > maxCount && (
                    <Badge
                      className={cn(
                        'bg-transparent text-foreground border-foreground/1 hover:bg-transparent whitespace-nowrap',
                        isAnimating ? 'animate-bounce' : '',
                        multiSelectVariants({ variant }),
                      )}
                      style={{ animationDuration: `${animation}s` }}
                    >
                      {`+ ${selectedValues.length - maxCount} more`}
                      <XCircle
                        className={cn(
                          "ml-2 h-4 w-4",
                          props.disabled ? "cursor-not-allowed" : "cursor-pointer"
                        )}
                        onClick={(event) => {
                          event.stopPropagation()
                          if (!props.disabled) {
                            clearExtraOptions()
                          }
                        }}
                      />
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <X
                    className={cn(
                      "h-4 mx-2 text-muted-foreground",
                      props.disabled ? "cursor-not-allowed" : "cursor-pointer"
                    )}
                    onClick={(event) => {
                      event.stopPropagation()
                      if (!props.disabled) {
                        handleClear()
                      }
                    }}
                  />
                  <Separator
                    orientation="vertical"
                    className="flex min-h-6 h-full"
                  />
                  <ChevronDown className={cn(
                    "h-4 mx-2 text-muted-foreground",
                    props.disabled ? "cursor-not-allowed" : "cursor-pointer"
                  )} />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between w-full mx-auto">
                <span className="text-sm text-muted-foreground mx-3">
                  {placeholder}
                </span>
                <ChevronDown className={cn(
                  "h-4 text-muted-foreground mx-2",
                  props.disabled ? "cursor-not-allowed" : "cursor-pointer"
                )} />
              </div>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-(--radix-popper-anchor-width) p-0 overflow-hidden rounded-md border-border shadow-md bg-popover"
          align="start"
          onEscapeKeyDown={() => setIsPopoverOpen(false)}
        >
          <Command className="rounded-none border-none">
            <CommandInput
              placeholder="Search..."
              onKeyDown={handleInputKeyDown}
              className="border-0"
            />
            <CommandList className="max-h-[300px] overflow-y-auto p-0">
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  key="all"
                  onSelect={toggleAll}
                  className="cursor-pointer"
                >
                  <div
                    className={cn(
                      'mr-2 flex h-4 w-4 items-center justify-center rounded-xs border border-primary',
                      selectedValues.length === flatOptions.length
                        ? 'bg-primary text-primary-foreground'
                        : 'opacity-50 [&_svg]:invisible',
                    )}
                  >
                    <CheckIcon className="h-4 w-4" />
                  </div>
                  <span>(Select All)</span>
                </CommandItem>
                
                {/* Render options based on whether they're grouped or not */}
                {isGrouped ? (
                  // Render grouped options
                  (options as OptionGroup[]).map((group) => (
                    <React.Fragment key={group.label}>
                      <CommandItem
                        className="text-sm font-semibold text-muted-foreground px-2 py-1.5 cursor-default pointer-events-none"
                        disabled
                      >
                        {group.label}
                      </CommandItem>
                      {group.options.map((option) => {
                        const isSelected = selectedValues.includes(option.value)
                        return (
                          <CommandItem
                            key={option.value}
                            onSelect={() => toggleOption(option.value)}
                            className="cursor-pointer pl-6"
                          >
                            <div
                              className={cn(
                                'mr-2 flex h-4 w-4 items-center justify-center rounded-xs border border-primary',
                                isSelected
                                  ? 'bg-primary text-primary-foreground'
                                  : 'opacity-50 [&_svg]:invisible',
                              )}
                            >
                              <CheckIcon className="h-4 w-4" />
                            </div>
                            {option.icon && (
                              <option.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                            )}
                            <span>{option.label}</span>
                          </CommandItem>
                        )
                      })}
                    </React.Fragment>
                  ))
                ) : (
                  // Render flat options
                  (options as Option[]).map((option) => {
                    const isSelected = selectedValues.includes(option.value)
                    return (
                      <CommandItem
                        key={option.value}
                        onSelect={() => toggleOption(option.value)}
                        className="cursor-pointer"
                      >
                        <div
                          className={cn(
                            'mr-2 flex h-4 w-4 items-center justify-center rounded-xs border border-primary',
                            isSelected
                              ? 'bg-primary text-primary-foreground'
                              : 'opacity-50 [&_svg]:invisible',
                          )}
                        >
                          <CheckIcon className="h-4 w-4" />
                        </div>
                        {option.icon && (
                          <option.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                        )}
                        <span>{option.label}</span>
                      </CommandItem>
                    )
                  })
                )}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <div className="flex items-center justify-between">
                  {selectedValues.length > 0 && (
                    <>
                      <CommandItem
                        onSelect={handleClear}
                        className="flex-1 justify-center cursor-pointer"
                      >
                        Clear
                      </CommandItem>
                      <Separator
                        orientation="vertical"
                        className="flex min-h-6 h-full"
                      />
                    </>
                  )}
                  <CommandItem
                    onSelect={() => setIsPopoverOpen(false)}
                    className="flex-1 justify-center cursor-pointer max-w-full"
                  >
                    Close
                  </CommandItem>
                </div>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
        {animation > 0 && selectedValues.length > 0 && (
          <WandSparkles
            className={cn(
              'cursor-pointer my-2 text-foreground bg-background w-3 h-3',
              isAnimating ? '' : 'text-muted-foreground',
            )}
            onClick={() => setIsAnimating(!isAnimating)}
          />
        )}
      </Popover>
    )
  },
)

MultiSelect.displayName = 'MultiSelect'

export default MultiSelect

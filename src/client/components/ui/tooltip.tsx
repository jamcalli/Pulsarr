'use client'

import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import * as React from 'react'
import { cn } from '@/lib/utils'
import { useMediaQuery } from '@/hooks/use-media-query'

// Create context to manage mobile tooltip state
type TooltipContextType = {
  isMobile: boolean;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const TooltipContext = React.createContext<TooltipContextType | null>(null)

// Provider component with mobile detection
const TooltipProvider = TooltipPrimitive.Provider

// Mobile-friendly Tooltip root component
interface TooltipProps extends React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root> {
  children: React.ReactNode;
}

const Tooltip = ({ children, ...props }: TooltipProps) => {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [isOpen, setIsOpen] = React.useState(false)
  
  return (
    <TooltipContext.Provider value={{ isMobile, isOpen, setIsOpen }}>
      <TooltipPrimitive.Root
        {...props}
        open={isMobile ? isOpen : undefined}
        delayDuration={isMobile ? 0 : props.delayDuration ?? 300}
      >
        {children}
      </TooltipPrimitive.Root>
    </TooltipContext.Provider>
  )
}

// Enhanced trigger with mobile click/tap handling
const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>(({ ...props }, ref) => {
  const context = React.useContext(TooltipContext)
  
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (context?.isMobile) {
      e.preventDefault()
      context.setIsOpen(!context.isOpen)
    }
    
    // Call the original onClick if it exists
    if (props.onClick) {
      props.onClick(e)
    }
  }
  
  return <TooltipPrimitive.Trigger ref={ref} {...props} onClick={handleClick} />
})
TooltipTrigger.displayName = TooltipPrimitive.Trigger.displayName

// Enhanced content with mobile styles and dismiss handler
const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => {
  const context = React.useContext(TooltipContext)
  
  // Create a handler for outside clicks/taps
  const handleOutsidePointer = (e: Event) => {
    if (context?.isMobile) {
      context.setIsOpen(false)
    }
    
    // Call the original handler if it exists
    if (props.onPointerDownOutside) {
      props.onPointerDownOutside(e as any)
    }
  }
  
  return (
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 overflow-hidden rounded-base border-2 border-border bg-bw text-text px-3 py-1.5 text-sm font-base animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        context?.isMobile && 'max-w-[90vw]', // Wider on mobile
        className,
      )}
      onPointerDownOutside={handleOutsidePointer}
      {...props}
    />
  )
})
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
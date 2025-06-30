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
  isControlled: boolean;
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
  const isControlled = props.open !== undefined
  
  // Use provided open prop if available, otherwise use internal state for mobile
  const controlledOpen = isControlled ? props.open : (isMobile ? isOpen : undefined)
  
  // Extract open from props to avoid confusion about precedence
  const { open: _, ...restProps } = props
  
  return (
    <TooltipContext.Provider value={{ isMobile, isOpen, setIsOpen, isControlled }}>
      <TooltipPrimitive.Root
        {...restProps}
        open={controlledOpen}
        delayDuration={isMobile ? 0 : props.delayDuration ?? 300}
      >
        {children}
      </TooltipPrimitive.Root>
    </TooltipContext.Provider>
  )
}

// Enhanced trigger with mobile long-press handling
const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>(({ ...props }, ref) => {
  const context = React.useContext(TooltipContext)
  const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isLongPressing, setIsLongPressing] = React.useState(false)
  
  const startLongPress = () => {
    if (context?.isMobile && !context?.isControlled) {
      longPressTimer.current = setTimeout(() => {
        setIsLongPressing(true)
        context.setIsOpen(true)
      }, 500) // 500ms hold duration
    }
  }
  
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    setIsLongPressing(false)
  }
  
  const handleTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    startLongPress()
    // Pass through the original handler with proper type casting
    if (props.onTouchStart) {
      props.onTouchStart(e as React.TouchEvent<HTMLButtonElement>)
    }
  }
  
  const handleTouchEnd = (e: React.TouchEvent<HTMLElement>) => {
    cancelLongPress()
    // Pass through the original handler with proper type casting
    if (props.onTouchEnd) {
      props.onTouchEnd(e as React.TouchEvent<HTMLButtonElement>)
    }
  }
  
  const handleTouchMove = (e: React.TouchEvent<HTMLElement>) => {
    cancelLongPress()
    // Pass through the original handler with proper type casting
    if (props.onTouchMove) {
      props.onTouchMove(e as React.TouchEvent<HTMLButtonElement>)
    }
  }
  
  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    // Only process click if not long pressing
    if (!isLongPressing && props.onClick) {
      props.onClick(e as React.MouseEvent<HTMLButtonElement>)
    }
    
    // Prevent click event if we just finished a long press
    if (isLongPressing) {
      e.preventDefault()
      e.stopPropagation()
      setIsLongPressing(false)
      if (!context?.isControlled) {
        context?.setIsOpen(false)
      }
    }
  }
  
  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current)
      }
    }
  }, [])
  
  return (
    <TooltipPrimitive.Trigger 
      ref={ref} 
      {...props} 
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
    />
  )
})
TooltipTrigger.displayName = TooltipPrimitive.Trigger.displayName

// Enhanced content with mobile styles and dismiss handler
const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => {
  const context = React.useContext(TooltipContext)
  
  // Create a handler for outside clicks/taps
  const handleOutsidePointer = React.useCallback((e: Event) => {
    if (context?.isMobile && !context?.isControlled) {
      context.setIsOpen(false)
    }
    
    // Call the original handler if it exists
    if (props.onPointerDownOutside) {
      props.onPointerDownOutside(e as any)
    }
  }, [context?.isMobile, context?.setIsOpen, props.onPointerDownOutside])
  
  return (
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 overflow-hidden rounded-base border-2 border-border bg-secondary-background text-foreground px-3 py-1.5 text-sm font-base animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
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
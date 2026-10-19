import { cn } from 'cn'
import type * as React from 'react'
import { createContext, useContext } from 'react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useScrollEdges } from '@/hooks/useScrollEdges'

const CredenzaMobileContext = createContext(false)

interface CredenzaProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

interface CredenzaPartProps {
  className?: string
  children?: React.ReactNode
}

interface CredenzaControlProps extends CredenzaPartProps {
  render?: React.ReactElement
}

function Credenza(props: CredenzaProps) {
  const isMobile = useIsMobile()
  return (
    <CredenzaMobileContext.Provider value={isMobile}>
      {isMobile ? <Drawer showSwipeHandle {...props} /> : <Dialog {...props} />}
    </CredenzaMobileContext.Provider>
  )
}

function CredenzaTrigger(props: CredenzaControlProps) {
  const Trigger = useContext(CredenzaMobileContext)
    ? DrawerTrigger
    : DialogTrigger
  return <Trigger {...props} />
}

function CredenzaClose(props: CredenzaControlProps) {
  const Close = useContext(CredenzaMobileContext) ? DrawerClose : DialogClose
  return <Close {...props} />
}

interface CredenzaContentProps extends CredenzaPartProps {
  /** Opens the mobile drawer at its height cap instead of sizing it to the content. */
  fullHeight?: boolean
  /** Lays the mobile swipe handle over the top of the content instead of above it. */
  floatingHandle?: boolean
  /** Hides the dialog's corner close button, for a credenza that must not close. */
  hideCloseButton?: boolean
}

function CredenzaContent({
  fullHeight,
  floatingHandle,
  hideCloseButton,
  className,
  ...props
}: CredenzaContentProps) {
  const isMobile = useContext(CredenzaMobileContext)
  if (!isMobile) {
    return (
      <DialogContent
        showCloseButton={!hideCloseButton}
        className={cn('flex flex-col', className)}
        {...props}
      />
    )
  }
  return (
    <DrawerContent
      className={cn(
        'flex flex-col',
        fullHeight && '[--drawer-content-height:100dvh]',
        floatingHandle &&
          '*:data-[slot=drawer-swipe-handle]:absolute *:data-[slot=drawer-swipe-handle]:inset-x-0 *:data-[slot=drawer-swipe-handle]:top-0 *:data-[slot=drawer-swipe-handle]:z-20',
        className,
      )}
      {...props}
    />
  )
}

function CredenzaHeader({ className, ...props }: CredenzaPartProps) {
  const isMobile = useContext(CredenzaMobileContext)
  const Header = isMobile ? DrawerHeader : DialogHeader
  return <Header className={cn(isMobile && 'pb-2', className)} {...props} />
}

function CredenzaTitle(props: CredenzaPartProps) {
  const Title = useContext(CredenzaMobileContext) ? DrawerTitle : DialogTitle
  return <Title {...props} />
}

function CredenzaDescription(props: CredenzaPartProps) {
  const Description = useContext(CredenzaMobileContext)
    ? DrawerDescription
    : DialogDescription
  return <Description {...props} />
}

/** Scrolls on its own so the header and footer stay in view, with a divider on each edge that has more content past it. */
function CredenzaBody({ className, children }: CredenzaPartProps) {
  const isMobile = useContext(CredenzaMobileContext)
  const edges = useScrollEdges<HTMLDivElement>()
  return (
    <div
      ref={edges.ref}
      onScroll={edges.onScroll}
      className={cn(
        'relative min-h-0 overflow-y-auto border-y border-transparent',
        isMobile ? 'px-4 py-2' : '-mx-6 -my-1 px-6 py-1',
        edges.canScrollUp && 'border-t-divider',
        edges.canScrollDown && 'border-b-divider',
      )}
    >
      <div className={className}>{children}</div>
    </div>
  )
}

function CredenzaFooter({ className, ...props }: CredenzaPartProps) {
  const isMobile = useContext(CredenzaMobileContext)
  const Footer = isMobile ? DrawerFooter : DialogFooter
  return (
    <Footer
      className={cn(isMobile && 'flex-col-reverse pt-2', className)}
      {...props}
    />
  )
}

export {
  Credenza,
  CredenzaBody,
  CredenzaClose,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
  CredenzaTrigger,
}

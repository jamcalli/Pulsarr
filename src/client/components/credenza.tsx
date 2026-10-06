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
}

function CredenzaContent({
  fullHeight,
  className,
  ...props
}: CredenzaContentProps) {
  const isMobile = useContext(CredenzaMobileContext)
  const Content = isMobile ? DrawerContent : DialogContent
  return (
    <Content
      className={cn(
        isMobile && fullHeight && '[--drawer-content-height:100dvh]',
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

function CredenzaBody({ className, ...props }: CredenzaPartProps) {
  const isMobile = useContext(CredenzaMobileContext)
  return <div className={cn(isMobile && 'px-4 py-2', className)} {...props} />
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

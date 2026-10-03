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
  const Root = isMobile ? Drawer : Dialog
  return (
    <CredenzaMobileContext.Provider value={isMobile}>
      <Root {...props} />
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

function CredenzaContent(props: CredenzaPartProps) {
  const Content = useContext(CredenzaMobileContext)
    ? DrawerContent
    : DialogContent
  return <Content {...props} />
}

function CredenzaHeader(props: CredenzaPartProps) {
  const Header = useContext(CredenzaMobileContext) ? DrawerHeader : DialogHeader
  return <Header {...props} />
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
  return <div className={cn(isMobile && 'px-4', className)} {...props} />
}

function CredenzaFooter(props: CredenzaPartProps) {
  const Footer = useContext(CredenzaMobileContext) ? DrawerFooter : DialogFooter
  return <Footer {...props} />
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

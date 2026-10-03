import { Link, useLocation } from 'react-router-dom'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { useNavAccordion } from '@/hooks/useNavAccordion'
import { usePendingApprovalCount } from '@/hooks/usePendingApprovalCount'
import {
  findActiveNav,
  isSingleLink,
  NAV_SECTIONS,
  pageHref,
} from '@/lib/navigation'

const sectionRowClass = 'h-10 gap-3 px-2.5 text-base [&_svg]:size-4.5'

function PendingBadge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-md border-2 border-border bg-warn px-1.5 text-xs font-bold text-main-foreground tabular-nums">
      {count}
    </span>
  )
}

export function SidebarNav() {
  const location = useLocation()
  const active = findActiveNav(location.pathname, location.hash)
  const pendingApprovals = usePendingApprovalCount()
  const { setOpenMobile } = useSidebar()
  const { openId, setSectionOpen } = useNavAccordion(active?.section.id ?? null)
  const closeMobile = () => setOpenMobile(false)

  return (
    <SidebarGroup className="px-3 py-2">
      <SidebarMenu className="gap-0.5">
        {NAV_SECTIONS.map((section) => {
          const Icon = section.icon
          const isActiveSection = active?.section.id === section.id
          const badge =
            section.badge === 'pendingApprovals' ? (
              <PendingBadge count={pendingApprovals} />
            ) : null

          if (isSingleLink(section)) {
            return (
              <SidebarMenuItem key={section.id}>
                <SidebarMenuButton
                  isActive={isActiveSection}
                  className={sectionRowClass}
                  render={
                    <Link
                      to={pageHref(section.pages[0])}
                      onClick={closeMobile}
                    />
                  }
                >
                  <Icon />
                  <span>{section.label}</span>
                  {badge}
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          }

          return (
            <Collapsible
              key={section.id}
              open={openId === section.id}
              onOpenChange={(next) => setSectionOpen(section.id, next)}
              render={<SidebarMenuItem />}
            >
              <CollapsibleTrigger
                render={
                  <SidebarMenuButton
                    isActive={isActiveSection}
                    className={sectionRowClass}
                  />
                }
              >
                <Icon />
                <span>{section.label}</span>
                {badge}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub className="mx-0 mt-0.5 mb-1.5 ml-5 translate-x-0 gap-px px-0 pl-3">
                  {section.pages.map((navPage) => (
                    <SidebarMenuSubItem key={navPage.to}>
                      <SidebarMenuSubButton
                        isActive={active?.page === navPage}
                        className="h-8"
                        render={
                          <Link to={pageHref(navPage)} onClick={closeMobile} />
                        }
                      >
                        <span>{navPage.label}</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            </Collapsible>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}

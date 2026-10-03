import { ArrowUpRight } from 'lucide-react'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { HELP_LINKS } from '@/lib/navigation'

export function SidebarHelp() {
  return (
    <SidebarGroup className="mt-auto px-3 py-2">
      <SidebarGroupLabel>Help</SidebarGroupLabel>
      <SidebarMenu className="gap-0.5">
        {HELP_LINKS.map(({ label, href, icon: Icon }) => (
          <SidebarMenuItem key={href}>
            <SidebarMenuButton
              className="gap-3 px-2.5"
              render={
                <a href={href} target="_blank" rel="noopener noreferrer" />
              }
            >
              <Icon />
              <span>{label}</span>
              <ArrowUpRight
                className="ml-auto text-muted-foreground"
                aria-hidden="true"
              />
              <span className="sr-only">(opens in a new tab)</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}

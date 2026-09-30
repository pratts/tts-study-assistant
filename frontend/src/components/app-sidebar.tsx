import { BookOpenIcon, ExternalLinkIcon, LayoutDashboardIcon, NotebookTextIcon, ShieldIcon, UserIcon } from 'lucide-react'
import type { ComponentProps } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { NavUser } from '@/components/nav-user'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'

const NAV = [
  { title: 'Dashboard', to: '/dashboard', icon: LayoutDashboardIcon },
  { title: 'Notes', to: '/notes', icon: NotebookTextIcon },
  { title: 'Profile', to: '/profile', icon: UserIcon },
] as const

export function AppSidebar(props: ComponentProps<typeof Sidebar>) {
  const { pathname } = useLocation()
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <BookOpenIcon className="size-4" />
                </div>
                <span className="truncate font-semibold">Study Assistant</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {NAV.map(({ title, to, icon: Icon }) => (
              <SidebarMenuItem key={to}>
                <SidebarMenuButton asChild isActive={pathname.startsWith(to)} tooltip={title}>
                  <NavLink to={to}>
                    <Icon />
                    <span>{title}</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Privacy Policy">
                <a href="/privacy-policy" target="_blank" rel="noopener noreferrer">
                  <ShieldIcon />
                  <span>Privacy Policy</span>
                  <ExternalLinkIcon className="ml-auto" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

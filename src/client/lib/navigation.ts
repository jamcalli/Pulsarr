import {
  Bell,
  BookOpen,
  CircleAlert,
  FolderGit2,
  House,
  Inbox,
  LibraryBig,
  type LucideIcon,
  MessagesSquare,
  Settings2,
  Users,
} from 'lucide-react'

export interface NavPage {
  label: string
  /** The page's URL in the new shell. */
  to: string
  /** Old URLs, the first is the link target until `rebuilt`, and a `#hash` entry matches only with that hash. */
  legacy: readonly [string, ...string[]]
  rebuilt: boolean
}

export interface NavSection {
  id: string
  label: string
  icon: LucideIcon
  badge?: 'pendingApprovals'
  pages: readonly [NavPage, ...NavPage[]]
}

export interface ActiveNav {
  section: NavSection
  /** Undefined when the URL matches the section but no single page, as in legacy `/notifications` without a hash. */
  page: NavPage | undefined
}

function page(
  label: string,
  to: string,
  legacy: readonly [string, ...string[]],
): NavPage {
  return { label, to, legacy, rebuilt: false }
}

export const NAV_PAGES = {
  dashboard: { ...page('Dashboard', '/', ['/dashboard']), rebuilt: true },
  approvalQueue: {
    ...page('Approval queue', '/requests', ['/approvals']),
    rebuilt: true,
  },
  approvalSettings: {
    ...page('Approval settings', '/requests/settings', ['/approvals/settings']),
    rebuilt: true,
  },
  quotas: {
    ...page('Quotas', '/requests/quotas', ['/approvals/quota-settings']),
    rebuilt: true,
  },
  plexUsers: {
    ...page('Plex users', '/users', ['/plex/users']),
    rebuilt: true,
  },
  newUserDefaults: {
    ...page('New user defaults', '/users/new-user-defaults', [
      '/utilities/new-user-defaults',
    ]),
    rebuilt: true,
  },
  userTags: {
    ...page('User tags', '/users/tags', ['/utilities/user-tags']),
    rebuilt: true,
  },
  plexLabels: {
    ...page('Plex labels', '/users/plex-labels', ['/utilities/plex-labels']),
    rebuilt: true,
  },
  radarr: {
    ...page('Radarr', '/library/radarr', ['/radarr/instances']),
    rebuilt: true,
  },
  sonarr: {
    ...page('Sonarr', '/library/sonarr', ['/sonarr/instances']),
    rebuilt: true,
  },
  contentRouter: {
    ...page('Content router', '/library/content-router', [
      '/radarr/content-router',
      '/sonarr/content-router',
    ]),
    rebuilt: true,
  },
  exclusions: page('Exclusions', '/library/exclusions', [
    '/utilities/watchlist-exclusions',
  ]),
  deleteSync: page('Delete sync', '/library/delete-sync', [
    '/utilities/delete-sync',
  ]),
  sessionMonitoring: {
    ...page('Session monitoring', '/library/session-monitoring', [
      '/utilities/plex-session-monitoring',
    ]),
    rebuilt: true,
  },
  discord: {
    ...page('Discord', '/notifications/discord', [
      '/notifications#discord-notifications',
    ]),
    rebuilt: true,
  },
  apprise: {
    ...page('Apprise', '/notifications/apprise', [
      '/notifications#apprise-notifications',
    ]),
    rebuilt: true,
  },
  webhooks: {
    ...page('Webhooks', '/notifications/webhooks', [
      '/notifications#native-webhooks',
    ]),
    rebuilt: true,
  },
  plexMobile: {
    ...page('Plex mobile', '/notifications/plex-mobile', [
      '/notifications#plex-mobile-notifications',
    ]),
    rebuilt: true,
  },
  publicContent: {
    ...page('Public content', '/notifications/public-content', [
      '/notifications#public-content-notifications',
    ]),
    rebuilt: true,
  },
  delivery: {
    ...page('Delivery', '/notifications/delivery', [
      '/notifications#general-notifications',
    ]),
    rebuilt: true,
  },
  plexConnection: {
    ...page('Plex connection', '/system/plex', [
      '/plex/configuration',
      '/utilities/plex-notifications',
    ]),
    rebuilt: true,
  },
  apiKeys: {
    ...page('API keys', '/system/api-keys', ['/utilities/api-keys']),
    rebuilt: true,
  },
  logs: {
    ...page('Logs', '/system/logs', ['/utilities/log-viewer']),
    rebuilt: true,
  },
} as const satisfies Record<string, NavPage>

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: 'home',
    label: 'Home',
    icon: House,
    pages: [NAV_PAGES.dashboard],
  },
  {
    id: 'requests',
    label: 'Requests',
    icon: Inbox,
    badge: 'pendingApprovals',
    pages: [
      NAV_PAGES.approvalQueue,
      NAV_PAGES.approvalSettings,
      NAV_PAGES.quotas,
    ],
  },
  {
    id: 'library',
    label: 'Library',
    icon: LibraryBig,
    pages: [
      NAV_PAGES.radarr,
      NAV_PAGES.sonarr,
      NAV_PAGES.contentRouter,
      NAV_PAGES.exclusions,
      NAV_PAGES.deleteSync,
      NAV_PAGES.sessionMonitoring,
    ],
  },
  {
    id: 'users',
    label: 'Users',
    icon: Users,
    pages: [
      NAV_PAGES.plexUsers,
      NAV_PAGES.newUserDefaults,
      NAV_PAGES.userTags,
      NAV_PAGES.plexLabels,
    ],
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: Bell,
    pages: [
      NAV_PAGES.discord,
      NAV_PAGES.apprise,
      NAV_PAGES.webhooks,
      NAV_PAGES.plexMobile,
      NAV_PAGES.publicContent,
      NAV_PAGES.delivery,
    ],
  },
  {
    id: 'system',
    label: 'System',
    icon: Settings2,
    pages: [NAV_PAGES.plexConnection, NAV_PAGES.apiKeys, NAV_PAGES.logs],
  },
]

export const DOCS_ROOT = 'https://jamcalli.github.io/Pulsarr/docs'
export const DOCS_URL = `${DOCS_ROOT}/intro`

export const HELP_LINKS: readonly {
  label: string
  href: string
  icon: LucideIcon
}[] = [
  {
    label: 'Discord',
    href: 'https://discord.com/invite/9csTEJn5cR',
    icon: MessagesSquare,
  },
  { label: 'Documentation', href: DOCS_URL, icon: BookOpen },
  {
    label: 'GitHub issues',
    href: 'https://github.com/jamcalli/Pulsarr/issues',
    icon: CircleAlert,
  },
  {
    label: 'GitHub repository',
    href: 'https://github.com/jamcalli/Pulsarr',
    icon: FolderGit2,
  },
]

export function pageHref(navPage: NavPage): string {
  return navPage.rebuilt ? navPage.to : navPage.legacy[0]
}

/** The approval queue reads its requester filter from this search param. */
export const APPROVAL_QUEUE_USER_PARAM = 'user'

export function approvalQueueHref({ user }: { user: number }): string {
  const params = new URLSearchParams({
    [APPROVAL_QUEUE_USER_PARAM]: String(user),
  })
  return `${pageHref(NAV_PAGES.approvalQueue)}?${params}`
}

export function userPageHref(id: number): string {
  return `${NAV_PAGES.plexUsers.to}/${id}`
}

/** A section with one page renders as a plain link, not an expandable group. */
export function isSingleLink(section: NavSection): boolean {
  return section.pages.length === 1
}

function trimTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
}

export function pathMatches(pattern: string, pathname: string): boolean {
  if (pattern === '/') return pathname === '/'
  return pathname === pattern || pathname.startsWith(`${pattern}/`)
}

/** The longest matching URL wins, and a `#hash` entry names its page only when the hash matches. */
export function findActiveNav(pathname: string, hash = ''): ActiveNav | null {
  const path = trimTrailingSlash(pathname)
  let best: { active: ActiveNav; score: number } | null = null
  for (const section of NAV_SECTIONS) {
    for (const navPage of section.pages) {
      for (const entry of [navPage.to, ...navPage.legacy]) {
        const [entryPath = '', entryHash] = entry.split('#')
        if (!pathMatches(entryPath, path)) continue
        const pageMatch = entryHash === undefined || `#${entryHash}` === hash
        const score = entryPath.length + (pageMatch ? 0.5 : 0)
        if (!best || score > best.score) {
          best = {
            active: { section, page: pageMatch ? navPage : undefined },
            score,
          }
        }
      }
    }
  }
  return best?.active ?? null
}

export interface Crumb {
  label: string
  to?: string
}

/** Header crumbs, section first, with only the section crumb for a single-page section. */
export function breadcrumbFor(pathname: string, hash = ''): Crumb[] {
  const active = findActiveNav(pathname, hash)
  if (!active) return []
  const { section, page: activePage } = active
  if (isSingleLink(section)) {
    const [onlyPage] = section.pages
    return onlyPage === activePage
      ? [{ label: section.label }]
      : [{ label: section.label, to: pageHref(onlyPage) }]
  }
  const sectionCrumb = { label: section.label, to: pageHref(section.pages[0]) }
  if (!activePage) return [sectionCrumb]
  return [sectionCrumb, { label: activePage.label, to: pageHref(activePage) }]
}

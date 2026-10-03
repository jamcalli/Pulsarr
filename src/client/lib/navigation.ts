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
  dashboard: page('Dashboard', '/', ['/dashboard']),
  approvalQueue: page('Approval queue', '/requests', ['/approvals']),
  approvalSettings: page('Approval settings', '/requests/settings', [
    '/approvals/settings',
  ]),
  quotas: page('Quotas', '/requests/quotas', ['/approvals/quota-settings']),
  plexUsers: page('Plex users', '/users', ['/plex/users']),
  newUserDefaults: page('New user defaults', '/users/new-user-defaults', [
    '/utilities/new-user-defaults',
  ]),
  userTags: page('User tags', '/users/tags', ['/utilities/user-tags']),
  plexLabels: page('Plex labels', '/users/plex-labels', [
    '/utilities/plex-labels',
  ]),
  radarr: page('Radarr', '/library/radarr', ['/radarr/instances']),
  sonarr: page('Sonarr', '/library/sonarr', ['/sonarr/instances']),
  contentRouter: page('Content router', '/library/content-router', [
    '/radarr/content-router',
    '/sonarr/content-router',
  ]),
  exclusions: page('Exclusions', '/library/exclusions', [
    '/utilities/watchlist-exclusions',
  ]),
  deleteSync: page('Delete sync', '/library/delete-sync', [
    '/utilities/delete-sync',
  ]),
  sessionMonitoring: page('Session monitoring', '/library/session-monitoring', [
    '/utilities/plex-session-monitoring',
  ]),
  discord: page('Discord', '/notifications/discord', [
    '/notifications#discord-notifications',
  ]),
  apprise: page('Apprise', '/notifications/apprise', [
    '/notifications#apprise-notifications',
  ]),
  webhooks: page('Webhooks', '/notifications/webhooks', [
    '/notifications#native-webhooks',
  ]),
  plexMobile: page('Plex Mobile', '/notifications/plex-mobile', [
    '/notifications#plex-mobile-notifications',
  ]),
  publicContent: page('Public content', '/notifications/public-content', [
    '/notifications#public-content-notifications',
  ]),
  delivery: page('Delivery', '/notifications/delivery', [
    '/notifications#general-notifications',
  ]),
  plexConnection: page('Plex connection', '/system/plex', [
    '/plex/configuration',
    '/utilities/plex-notifications',
  ]),
  apiKeys: page('API keys', '/system/api-keys', ['/utilities/api-keys']),
  logs: page('Logs', '/system/logs', ['/utilities/log-viewer']),
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

export const DOCS_URL = 'https://jamcalli.github.io/Pulsarr/docs/intro'

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

/** A section with one page renders as a plain link, not an expandable group. */
export function isSingleLink(section: NavSection): boolean {
  return section.pages.length === 1
}

function trimTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
}

function pathMatches(pattern: string, pathname: string): boolean {
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

/** Header labels, section first, with only the section label for a single-page section. */
export function breadcrumbFor(pathname: string, hash = ''): string[] {
  const active = findActiveNav(pathname, hash)
  if (!active) return []
  const { section, page: activePage } = active
  if (!activePage || isSingleLink(section)) return [section.label]
  return [section.label, activePage.label]
}

import { Bell, House, Inbox, LibraryBig, Settings2, Users } from 'lucide-react'
import {
  breadcrumbFor,
  findActiveNav,
  legacyRedirects,
  NAV_PAGES,
  NAV_SECTIONS,
  pageHref,
} from '@/lib/navigation'

describe('NAV_SECTIONS', () => {
  it('lists the sections in sidebar order with their icons', () => {
    expect(NAV_SECTIONS.map(({ label, icon }) => ({ label, icon }))).toEqual([
      { label: 'Home', icon: House },
      { label: 'Requests', icon: Inbox },
      { label: 'Library', icon: LibraryBig },
      { label: 'Users', icon: Users },
      { label: 'Notifications', icon: Bell },
      { label: 'System', icon: Settings2 },
    ])
  })
})

describe('pageHref', () => {
  it('points every page at its new URL', () => {
    for (const section of NAV_SECTIONS) {
      for (const navPage of section.pages) {
        expect(pageHref(navPage)).toBe(navPage.to)
      }
    }
  })

  it('links User tags to its page', () => {
    expect(pageHref(NAV_PAGES.userTags)).toBe('/users/tags')
  })

  it('links Approval settings to its page', () => {
    expect(pageHref(NAV_PAGES.approvalSettings)).toBe('/requests/settings')
  })

  it('links Content router to its page', () => {
    expect(pageHref(NAV_PAGES.contentRouter)).toBe('/library/content-router')
  })

  it('links the dashboard to the home page', () => {
    expect(pageHref(NAV_PAGES.dashboard)).toBe('/')
  })
})

describe('legacyRedirects', () => {
  const redirects = legacyRedirects()
  const targetOf = (path: string) =>
    redirects.find((redirect) => redirect.path === path)?.to

  it('redirects only absolute paths', () => {
    for (const { path } of redirects) expect(path.startsWith('/')).toBe(true)
  })

  it('lists each path once', () => {
    const paths = redirects.map(({ path }) => path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('never redirects a path to itself', () => {
    for (const { path, to } of redirects) expect(path).not.toBe(to)
  })

  it('sends /notifications to the first notifications page in sidebar order', () => {
    const notifications = NAV_SECTIONS.find(({ id }) => id === 'notifications')
    expect(notifications).toBeDefined()
    expect(targetOf('/notifications')).toBe(
      notifications && pageHref(notifications.pages[0]),
    )
  })

  it('sends the old exclusions URL to the exclusions page', () => {
    expect(targetOf('/utilities/watchlist-exclusions')).toBe(
      pageHref(NAV_PAGES.exclusions),
    )
  })

  it('sends /dashboard to the home page', () => {
    expect(targetOf('/dashboard')).toBe('/')
  })
})

describe('findActiveNav', () => {
  it.each([
    ['/', 'home', NAV_PAGES.dashboard],
    ['/dashboard', 'home', NAV_PAGES.dashboard],
    ['/requests', 'requests', NAV_PAGES.approvalQueue],
    ['/approvals', 'requests', NAV_PAGES.approvalQueue],
    ['/requests/settings', 'requests', NAV_PAGES.approvalSettings],
    ['/approvals/settings', 'requests', NAV_PAGES.approvalSettings],
    ['/approvals/quota-settings', 'requests', NAV_PAGES.quotas],
    ['/users', 'users', NAV_PAGES.plexUsers],
    ['/users/tags', 'users', NAV_PAGES.userTags],
    ['/utilities/user-tags', 'users', NAV_PAGES.userTags],
    ['/library/content-router', 'library', NAV_PAGES.contentRouter],
    ['/sonarr/content-router', 'library', NAV_PAGES.contentRouter],
    ['/radarr/instances', 'library', NAV_PAGES.radarr],
    ['/utilities/plex-notifications', 'system', NAV_PAGES.plexConnection],
    ['/system/logs', 'system', NAV_PAGES.logs],
    ['/notifications/discord', 'notifications', NAV_PAGES.discord],
    ['/notifications/delivery', 'notifications', NAV_PAGES.delivery],
  ])('matches %s to %s', (pathname, sectionId, navPage) => {
    const active = findActiveNav(pathname)
    expect(active?.section.id).toBe(sectionId)
    expect(active?.page).toBe(navPage)
  })

  it('matches nested paths under a page to that page', () => {
    expect(findActiveNav('/library/radarr/3')?.page).toBe(NAV_PAGES.radarr)
  })

  it('ignores a trailing slash', () => {
    expect(findActiveNav('/users/tags/')?.page).toBe(NAV_PAGES.userTags)
  })

  it('matches a legacy anchor page only with its hash', () => {
    expect(
      findActiveNav('/notifications', '#apprise-notifications')?.page,
    ).toBe(NAV_PAGES.apprise)
  })

  it('matches only the section for a legacy anchor page without a hash', () => {
    const active = findActiveNav('/notifications')
    expect(active?.section.id).toBe('notifications')
    expect(active?.page).toBeUndefined()
  })

  it.each(['/login', '/account', '/userss', '/dashboard-old'])(
    'returns null for %s',
    (pathname) => {
      expect(findActiveNav(pathname)).toBeNull()
    },
  )
})

describe('breadcrumbFor', () => {
  it('links the section to its first page and the page to itself', () => {
    expect(breadcrumbFor('/requests/settings')).toEqual([
      { label: 'Requests', to: '/requests' },
      { label: 'Approval settings', to: '/requests/settings' },
    ])
  })

  it('links a user page back to Plex users', () => {
    expect(breadcrumbFor('/users/2')).toEqual([
      { label: 'Users', to: '/users' },
      { label: 'Plex users', to: '/users' },
    ])
  })

  it('shows only an unlinked section for a single-page section on its page', () => {
    expect(breadcrumbFor('/')).toEqual([{ label: 'Home' }])
  })

  it('links only the section when no page matches', () => {
    expect(breadcrumbFor('/notifications')).toEqual([
      { label: 'Notifications', to: pageHref(NAV_PAGES.discord) },
    ])
  })

  it('names the general notifications anchor Delivery', () => {
    expect(
      breadcrumbFor('/notifications', '#general-notifications').map(
        (crumb) => crumb.label,
      ),
    ).toEqual(['Notifications', 'Delivery'])
  })

  it('links the anchored page when the hash matches', () => {
    expect(breadcrumbFor('/notifications', '#native-webhooks')).toEqual([
      { label: 'Notifications', to: pageHref(NAV_PAGES.discord) },
      { label: 'Webhooks', to: pageHref(NAV_PAGES.webhooks) },
    ])
  })

  it('is empty outside the nav', () => {
    expect(breadcrumbFor('/login')).toEqual([])
  })
})

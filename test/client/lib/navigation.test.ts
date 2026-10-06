import { Bell, House, Inbox, LibraryBig, Settings2, Users } from 'lucide-react'
import {
  breadcrumbFor,
  findActiveNav,
  NAV_PAGES,
  NAV_SECTIONS,
  type NavPage,
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
  it('links to the first legacy URL until the page is rebuilt', () => {
    expect(pageHref(NAV_PAGES.contentRouter)).toBe('/radarr/content-router')
  })

  it('links to the new URL once the page is rebuilt', () => {
    const rebuilt: NavPage = { ...NAV_PAGES.contentRouter, rebuilt: true }
    expect(pageHref(rebuilt)).toBe('/library/content-router')
  })

  it('points rebuilt pages at their new URL and the rest at a legacy URL', () => {
    for (const section of NAV_SECTIONS) {
      for (const navPage of section.pages) {
        expect(pageHref(navPage)).toBe(
          navPage.rebuilt ? navPage.to : navPage.legacy[0],
        )
      }
    }
  })

  it('links User tags to its rebuilt page', () => {
    expect(pageHref(NAV_PAGES.userTags)).toBe('/users/tags')
  })

  it('links the dashboard to the rebuilt home page', () => {
    expect(pageHref(NAV_PAGES.dashboard)).toBe('/')
  })
})

describe('findActiveNav', () => {
  it.each([
    ['/', 'home', NAV_PAGES.dashboard],
    ['/dashboard', 'home', NAV_PAGES.dashboard],
    ['/requests', 'requests', NAV_PAGES.approvalQueue],
    ['/approvals', 'requests', NAV_PAGES.approvalQueue],
    ['/requests/settings', 'requests', NAV_PAGES.approvalSettings],
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
  it('shows section and page', () => {
    expect(breadcrumbFor('/approvals/settings')).toEqual([
      'Requests',
      'Approval settings',
    ])
  })

  it('shows only the section for a single-page section', () => {
    expect(breadcrumbFor('/')).toEqual(['Home'])
  })

  it('shows only the section when no page matches', () => {
    expect(breadcrumbFor('/notifications')).toEqual(['Notifications'])
  })

  it('names the general notifications anchor Delivery', () => {
    expect(breadcrumbFor('/notifications', '#general-notifications')).toEqual([
      'Notifications',
      'Delivery',
    ])
  })

  it('shows the anchored page when the hash matches', () => {
    expect(breadcrumbFor('/notifications', '#native-webhooks')).toEqual([
      'Notifications',
      'Webhooks',
    ])
  })

  it('is empty outside the nav', () => {
    expect(breadcrumbFor('/login')).toEqual([])
  })
})

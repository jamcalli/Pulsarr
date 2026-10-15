import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { SettingsPageSkeleton } from '@/components/settings/settings-page-skeleton'
import { HomeSkeleton } from '@/features/home/components/home-skeleton'
import { ContentRouterSkeleton } from '@/features/library/components/content-router/content-router-skeleton'
import { ArrInstancesSkeleton } from '@/features/library/components/instances/arr-instances-skeleton'
import { SessionMonitoringSkeleton } from '@/features/library/components/session-monitoring/session-monitoring-skeleton'
import { ApprovalQueueSkeleton } from '@/features/requests/components/approval-queue/approval-queue-skeleton'
import { APPROVAL_SETTINGS_SKELETON } from '@/features/requests/lib/approval-settings-skeleton'
import { QUOTA_SETTINGS_SKELETON } from '@/features/requests/lib/quota-settings-skeleton'
import { ApiKeysSkeleton } from '@/features/system/components/api-keys/api-keys-skeleton'
import { PlexConnectionSkeleton } from '@/features/system/components/plex-connection/plex-connection-skeleton'
import { NewUserDefaultsSkeleton } from '@/features/users/components/new-user-defaults/new-user-defaults-skeleton'
import { PlexUsersSkeleton } from '@/features/users/components/plex-users/plex-users-skeleton'
import { UserPageSkeleton } from '@/features/users/components/user/user-page-skeleton'
import { PLEX_LABELS_SKELETON } from '@/features/users/lib/plex-labels-skeleton'
import { USER_TAGS_SKELETON } from '@/features/users/lib/user-tags-skeleton'
import AppLayout from '@/layouts/app'
import RootLayout from '@/layouts/root'
import AuthenticatedLayout from '@/legacy/layouts/authenticated'
import { BASE_PATH } from '@/lib/basePath.js'
import { NAV_PAGES, pageHref } from '@/lib/navigation'

const LoginPage = lazy(() => import('@/features/auth'))
const HomePage = lazy(() => import('@/features/home'))
const UserTagsPage = lazy(() => import('@/features/users/pages/user-tags'))
const NewUserDefaultsPage = lazy(
  () => import('@/features/users/pages/new-user-defaults'),
)
const PlexLabelsPage = lazy(() => import('@/features/users/pages/plex-labels'))
const PlexUsersPage = lazy(() => import('@/features/users/pages/plex-users'))
const UserPage = lazy(() => import('@/features/users/pages/user'))
const ApprovalQueuePage = lazy(
  () => import('@/features/requests/pages/approval-queue'),
)
const ApprovalSettingsPage = lazy(
  () => import('@/features/requests/pages/approval-settings'),
)
const QuotaSettingsPage = lazy(
  () => import('@/features/requests/pages/quota-settings'),
)
const ContentRouterPage = lazy(
  () => import('@/features/library/pages/content-router'),
)
const ArrInstancesPage = lazy(
  () => import('@/features/library/pages/arr-instances'),
)
const SessionMonitoringPage = lazy(
  () => import('@/features/library/pages/session-monitoring'),
)
const ApiKeysPage = lazy(() => import('@/features/system/pages/api-keys'))
const PlexConnectionPage = lazy(
  () => import('@/features/system/pages/plex-connection'),
)
const CreateUserPage = lazy(() => import('@/legacy/features/setup'))
const LegacyPlexConfigurationPage = lazy(
  () => import('@/legacy/features/system/pages/plex-connection'),
)
const ApprovalsPage = lazy(() => import('@/legacy/features/requests'))
const NotificationsConfigPage = lazy(
  () => import('@/legacy/features/notifications'),
)
const DashboardPage = lazy(() => import('@/legacy/features/home'))
const DeleteSyncPage = lazy(
  () => import('@/legacy/features/library/pages/delete-sync'),
)
const LegacyPlexNotificationsPage = lazy(
  () => import('@/legacy/features/system/pages/plex-notifications'),
)
const LegacyNewUserDefaultsPage = lazy(
  () => import('@/legacy/features/users/pages/new-user-defaults'),
)
const LegacySessionMonitoringPage = lazy(
  () => import('@/legacy/features/library/pages/plex-session-monitoring'),
)
const LegacyUserTagsPage = lazy(
  () => import('@/legacy/features/users/pages/user-tags'),
)
const LegacyPlexLabelsPage = lazy(
  () => import('@/legacy/features/users/pages/plex-labels'),
)
const LegacyApiKeysPage = lazy(
  () => import('@/legacy/features/system/pages/api-keys'),
)
const WatchlistExclusionsPage = lazy(
  () => import('@/legacy/features/users/pages/watchlist-exclusions'),
)
const LogViewerPage = lazy(
  () => import('@/legacy/features/system/pages/log-viewer'),
)
const LegacyApprovalSettingsPage = lazy(
  () => import('@/legacy/features/requests/pages/approval-settings'),
)
const LegacyQuotaSettingsPage = lazy(
  () => import('@/legacy/features/requests/pages/quota-settings'),
)
const SonarrInstancesPage = lazy(
  () => import('@/legacy/features/library/pages/sonarr-instances'),
)
const SonarrContentRouterPage = lazy(
  () => import('@/legacy/features/library/pages/sonarr-content-router'),
)
const RadarrInstancesPage = lazy(
  () => import('@/legacy/features/library/pages/radarr-instances'),
)
const RadarrContentRouterPage = lazy(
  () => import('@/legacy/features/library/pages/radarr-content-router'),
)
const NotFoundPage = lazy(() => import('@/legacy/features/not-found'))
const AccountSettingsPage = lazy(() => import('@/legacy/features/account'))

const LoadingFallback = () => null

/**
 * Get the configured base path for the router.
 * Reads from the <base> tag injected by the server.
 */
function getBasename(): string {
  return BASE_PATH === '/' ? '' : BASE_PATH
}

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: (
        <RootLayout>
          <Outlet />
        </RootLayout>
      ),
      children: [
        {
          element: <AppLayout />,
          children: [
            {
              index: true,
              element: (
                <Suspense fallback={<HomeSkeleton />}>
                  <HomePage />
                </Suspense>
              ),
            },
            {
              path: 'users',
              element: (
                <Suspense fallback={<PlexUsersSkeleton />}>
                  <PlexUsersPage />
                </Suspense>
              ),
            },
            {
              path: 'users/:id',
              element: (
                <Suspense fallback={<UserPageSkeleton />}>
                  <UserPage />
                </Suspense>
              ),
            },
            {
              path: 'users/tags',
              element: (
                <Suspense
                  fallback={<SettingsPageSkeleton {...USER_TAGS_SKELETON} />}
                >
                  <UserTagsPage />
                </Suspense>
              ),
            },
            {
              path: 'users/new-user-defaults',
              element: (
                <Suspense fallback={<NewUserDefaultsSkeleton />}>
                  <NewUserDefaultsPage />
                </Suspense>
              ),
            },
            {
              path: 'users/plex-labels',
              element: (
                <Suspense
                  fallback={<SettingsPageSkeleton {...PLEX_LABELS_SKELETON} />}
                >
                  <PlexLabelsPage />
                </Suspense>
              ),
            },
            {
              path: 'requests',
              element: (
                <Suspense fallback={<ApprovalQueueSkeleton />}>
                  <ApprovalQueuePage />
                </Suspense>
              ),
            },
            {
              path: 'requests/settings',
              element: (
                <Suspense
                  fallback={
                    <SettingsPageSkeleton {...APPROVAL_SETTINGS_SKELETON} />
                  }
                >
                  <ApprovalSettingsPage />
                </Suspense>
              ),
            },
            {
              path: 'requests/quotas',
              element: (
                <Suspense
                  fallback={
                    <SettingsPageSkeleton {...QUOTA_SETTINGS_SKELETON} />
                  }
                >
                  <QuotaSettingsPage />
                </Suspense>
              ),
            },
            {
              path: 'library/radarr',
              element: (
                <Suspense fallback={<ArrInstancesSkeleton />}>
                  <ArrInstancesPage key="radarr" type="radarr" />
                </Suspense>
              ),
            },
            {
              path: 'library/sonarr',
              element: (
                <Suspense fallback={<ArrInstancesSkeleton />}>
                  <ArrInstancesPage key="sonarr" type="sonarr" />
                </Suspense>
              ),
            },
            {
              path: 'library/content-router',
              element: (
                <Suspense fallback={<ContentRouterSkeleton />}>
                  <ContentRouterPage />
                </Suspense>
              ),
            },
            {
              path: 'library/session-monitoring',
              element: (
                <Suspense fallback={<SessionMonitoringSkeleton />}>
                  <SessionMonitoringPage />
                </Suspense>
              ),
            },
            {
              path: 'system/plex',
              element: (
                <Suspense fallback={<PlexConnectionSkeleton />}>
                  <PlexConnectionPage />
                </Suspense>
              ),
            },
            {
              path: 'system/api-keys',
              element: (
                <Suspense fallback={<ApiKeysSkeleton />}>
                  <ApiKeysPage />
                </Suspense>
              ),
            },
          ],
        },
        {
          path: 'login',
          element: (
            <Suspense fallback={<LoadingFallback />}>
              <LoginPage />
            </Suspense>
          ),
        },
        {
          path: 'create-user',
          element: (
            <Suspense fallback={<LoadingFallback />}>
              <CreateUserPage />
            </Suspense>
          ),
        },
        {
          path: 'plex',
          children: [
            {
              index: true,
              element: (
                <Navigate to={pageHref(NAV_PAGES.plexConnection)} replace />
              ),
            },
            {
              path: 'configuration',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <LegacyPlexConfigurationPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
            {
              path: 'users',
              element: <Navigate to={pageHref(NAV_PAGES.plexUsers)} replace />,
            },
          ],
        },
        {
          path: 'sonarr',
          children: [
            {
              path: 'instances',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <SonarrInstancesPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
            {
              path: 'content-router',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <SonarrContentRouterPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
          ],
        },
        {
          path: 'radarr',
          children: [
            {
              path: 'instances',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <RadarrInstancesPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
            {
              path: 'content-router',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <RadarrContentRouterPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
          ],
        },
        {
          path: 'notifications',
          element: (
            <AuthenticatedLayout>
              <Suspense fallback={<LoadingFallback />}>
                <NotificationsConfigPage />
              </Suspense>
            </AuthenticatedLayout>
          ),
        },
        {
          path: 'dashboard',
          element: (
            <AuthenticatedLayout>
              <Suspense fallback={<LoadingFallback />}>
                <DashboardPage />
              </Suspense>
            </AuthenticatedLayout>
          ),
        },
        {
          path: 'account',
          element: (
            <AuthenticatedLayout>
              <Suspense fallback={<LoadingFallback />}>
                <AccountSettingsPage />
              </Suspense>
            </AuthenticatedLayout>
          ),
        },
        {
          path: 'utilities',
          children: [
            {
              path: 'delete-sync',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <DeleteSyncPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
            {
              path: 'plex-notifications',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <LegacyPlexNotificationsPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
            {
              path: 'new-user-defaults',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <LegacyNewUserDefaultsPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
            {
              path: 'plex-session-monitoring',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <LegacySessionMonitoringPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
            {
              path: 'user-tags',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <LegacyUserTagsPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
            {
              path: 'plex-labels',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <LegacyPlexLabelsPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
            {
              path: 'api-keys',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <LegacyApiKeysPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
            {
              path: 'watchlist-exclusions',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <WatchlistExclusionsPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
            {
              path: 'log-viewer',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <LogViewerPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
          ],
        },
        {
          path: 'approvals',
          children: [
            {
              index: true,
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <ApprovalsPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
            {
              path: 'settings',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <LegacyApprovalSettingsPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
            {
              path: 'quota-settings',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <LegacyQuotaSettingsPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
          ],
        },
        {
          path: '*',
          element: (
            <Suspense fallback={<LoadingFallback />}>
              <NotFoundPage />
            </Suspense>
          ),
        },
      ],
    },
  ],
  {
    basename: getBasename(),
  },
)

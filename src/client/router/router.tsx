import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { PageSkeleton } from '@/components/page-header'
import { SettingsPageSkeleton } from '@/components/settings/settings-page-skeleton'
import AppLayout from '@/layouts/app'
import RootLayout from '@/layouts/root'
import AuthenticatedLayout from '@/legacy/layouts/authenticated'
import { BASE_PATH } from '@/lib/basePath.js'

const LoginPage = lazy(() => import('@/features/auth'))
const HomePage = lazy(() => import('@/features/home'))
const UserTagsPage = lazy(() => import('@/features/users/pages/user-tags'))
const CreateUserPage = lazy(() => import('@/legacy/features/setup'))
const PlexConfigurationPage = lazy(
  () => import('@/legacy/features/system/pages/plex-connection'),
)
const PlexUsersPage = lazy(
  () => import('@/legacy/features/users/pages/plex-users'),
)
const ApprovalsPage = lazy(() => import('@/legacy/features/requests'))
const NotificationsConfigPage = lazy(
  () => import('@/legacy/features/notifications'),
)
const DashboardPage = lazy(() => import('@/legacy/features/home'))
const DeleteSyncPage = lazy(
  () => import('@/legacy/features/library/pages/delete-sync'),
)
const PlexNotificationsPage = lazy(
  () => import('@/legacy/features/system/pages/plex-notifications'),
)
const NewUserDefaultsPage = lazy(
  () => import('@/legacy/features/users/pages/new-user-defaults'),
)
const PlexSessionMonitoringPage = lazy(
  () => import('@/legacy/features/library/pages/plex-session-monitoring'),
)
const LegacyUserTagsPage = lazy(
  () => import('@/legacy/features/users/pages/user-tags'),
)
const PlexLabelsPage = lazy(
  () => import('@/legacy/features/users/pages/plex-labels'),
)
const ApiKeysPage = lazy(
  () => import('@/legacy/features/system/pages/api-keys'),
)
const WatchlistExclusionsPage = lazy(
  () => import('@/legacy/features/users/pages/watchlist-exclusions'),
)
const LogViewerPage = lazy(
  () => import('@/legacy/features/system/pages/log-viewer'),
)
const ApprovalSettingsPage = lazy(
  () => import('@/legacy/features/requests/pages/approval-settings'),
)
const QuotaSettingsPage = lazy(
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
                <Suspense fallback={<PageSkeleton />}>
                  <HomePage />
                </Suspense>
              ),
            },
            {
              path: 'users/tags',
              element: (
                <Suspense fallback={<SettingsPageSkeleton sections={4} />}>
                  <UserTagsPage />
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
              element: <Navigate to="/plex/configuration" replace />,
            },
            {
              path: 'configuration',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <PlexConfigurationPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
            {
              path: 'users',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <PlexUsersPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
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
                    <PlexNotificationsPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
            {
              path: 'new-user-defaults',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <NewUserDefaultsPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
            {
              path: 'plex-session-monitoring',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <PlexSessionMonitoringPage />
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
                    <PlexLabelsPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
            {
              path: 'api-keys',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <ApiKeysPage />
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
                    <ApprovalSettingsPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
            {
              path: 'quota-settings',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <QuotaSettingsPage />
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

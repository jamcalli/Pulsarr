import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import AuthenticatedLayout from '@/layouts/authenticated'
import RootLayout from '@/layouts/root'

const LoginPage = lazy(() => import('@/features/auth'))
const CreateUserPage = lazy(() => import('@/features/create-user'))
const PlexConfigurationPage = lazy(
  () => import('@/features/plex/pages/configuration'),
)
const PlexUsersPage = lazy(() => import('@/features/plex/pages/users'))
const ApprovalsPage = lazy(() => import('@/features/approvals'))
const NotificationsConfigPage = lazy(() => import('@/features/notifications'))
const DashboardPage = lazy(() => import('@/features/dashboard'))
const DeleteSyncPage = lazy(
  () => import('@/features/utilities/pages/delete-sync'),
)
const PlexNotificationsPage = lazy(
  () => import('@/features/utilities/pages/plex-notifications'),
)
const NewUserDefaultsPage = lazy(
  () => import('@/features/utilities/pages/new-user-defaults'),
)
const PlexSessionMonitoringPage = lazy(
  () => import('@/features/utilities/pages/plex-session-monitoring'),
)
const PublicContentNotificationsPage = lazy(
  () => import('@/features/utilities/pages/public-content-notifications'),
)
const UserTagsPage = lazy(() => import('@/features/utilities/pages/user-tags'))
const PlexLabelsPage = lazy(
  () => import('@/features/utilities/pages/plex-labels'),
)
const ApiKeysPage = lazy(() => import('@/features/utilities/pages/api-keys'))
const LogViewerPage = lazy(
  () => import('@/features/utilities/pages/log-viewer'),
)
const ApprovalSettingsPage = lazy(
  () => import('@/features/approvals/pages/approval-settings'),
)
const QuotaSettingsPage = lazy(
  () => import('@/features/approvals/pages/quota-settings'),
)
const SonarrInstancesPage = lazy(
  () => import('@/features/sonarr/pages/sonarr-instances'),
)
const SonarrContentRouterPage = lazy(
  () => import('@/features/sonarr/pages/sonarr-content-router'),
)
const RadarrInstancesPage = lazy(
  () => import('@/features/radarr/pages/radarr-instances'),
)
const RadarrContentRouterPage = lazy(
  () => import('@/features/radarr/pages/radarr-content-router'),
)
const NotFoundPage = lazy(() => import('@/features/not-found'))

const LoadingFallback = () => null

// Get the base path from the URL - everything before the first known route
function getBasename(): string {
  const path = window.location.pathname
  const knownRoutes = [
    '/dashboard',
    '/login',
    '/create-user',
    '/plex',
    '/sonarr',
    '/radarr',
    '/notifications',
    '/utilities',
    '/approvals',
  ]

  for (const route of knownRoutes) {
    const index = path.indexOf(route)
    if (index > 0) {
      return path.substring(0, index)
    } else if (index === 0) {
      return ''
    }
  }
  return ''
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
          index: true,
          element: <Navigate to="/dashboard" replace />,
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
              path: 'public-content-notifications',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <PublicContentNotificationsPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
            {
              path: 'user-tags',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <UserTagsPage />
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

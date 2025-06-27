import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import AuthenticatedLayout from '@/layouts/authenticated'
import RootLayout from '@/layouts/root'

const LoginPage = lazy(() => import('@/features/auth'))
const CreateUserPage = lazy(() => import('@/features/create-user'))
const PlexConfigPage = lazy(() => import('@/features/plex'))
const PlexConfigurationPage = lazy(
  () => import('@/features/plex/pages/configuration'),
)
const PlexUsersPage = lazy(() => import('@/features/plex/pages/users'))
const ApprovalsPage = lazy(() => import('@/features/approvals'))
const SonarrConfigPage = lazy(() => import('@/features/sonarr'))
const RadarrConfigPage = lazy(() => import('@/features/radarr'))
const NotificationsConfigPage = lazy(() => import('@/features/notifications'))
const DashboardPage = lazy(() => import('@/features/dashboard'))
const UtilitiesPage = lazy(() => import('@/features/utilities'))
const NotFoundPage = lazy(() => import('@/features/not-found'))

const LoadingFallback = () => null

export const router = createBrowserRouter([
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
        element: (
          <AuthenticatedLayout>
            <Suspense fallback={<LoadingFallback />}>
              <SonarrConfigPage />
            </Suspense>
          </AuthenticatedLayout>
        ),
      },
      {
        path: 'radarr',
        element: (
          <AuthenticatedLayout>
            <Suspense fallback={<LoadingFallback />}>
              <RadarrConfigPage />
            </Suspense>
          </AuthenticatedLayout>
        ),
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
        element: (
          <AuthenticatedLayout>
            <Suspense fallback={<LoadingFallback />}>
              <UtilitiesPage />
            </Suspense>
          </AuthenticatedLayout>
        ),
      },
      {
        path: 'approvals',
        element: (
          <AuthenticatedLayout>
            <Suspense fallback={<LoadingFallback />}>
              <ApprovalsPage />
            </Suspense>
          </AuthenticatedLayout>
        ),
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
])

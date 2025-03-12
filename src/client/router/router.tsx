import { lazy, Suspense } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import AuthenticatedLayout from '@/layouts/authenticated'

const LoginPage = lazy(() => import('@/features/auth'))
const CreateUserPage = lazy(() => import('@/features/create-user'))
const PlexConfigPage = lazy(() => import('@/features/plex'))
const SonarrConfigPage = lazy(() => import('@/features/sonarr'))
const RadarrConfigPage = lazy(() => import('@/features/radarr'))
const NotificationsConfigPage = lazy(() => import('@/features/notifications'))
const DashboardPage = lazy(() => import('@/features/dashboard'))

const LoadingFallback = () => null

export const router = createBrowserRouter([
  {
    path: '/app/login',
    element: (
      <Suspense fallback={<LoadingFallback />}>
        <LoginPage />
      </Suspense>
    ),
  },
  {
    path: '/app/create-user',
    element: (
      <Suspense fallback={<LoadingFallback />}>
        <CreateUserPage />
      </Suspense>
    ),
  },
  {
    path: '/app/plex',
    element: (
      <AuthenticatedLayout>
        <Suspense fallback={<LoadingFallback />}>
          <PlexConfigPage />
        </Suspense>
      </AuthenticatedLayout>
    ),
  },
  {
    path: '/app/sonarr',
    element: (
      <AuthenticatedLayout>
        <Suspense fallback={<LoadingFallback />}>
          <SonarrConfigPage />
        </Suspense>
      </AuthenticatedLayout>
    ),
  },
  {
    path: '/app/radarr',
    element: (
      <AuthenticatedLayout>
        <Suspense fallback={<LoadingFallback />}>
          <RadarrConfigPage />
        </Suspense>
      </AuthenticatedLayout>
    ),
  },
  {
    path: '/app/notifications',
    element: (
      <AuthenticatedLayout>
        <Suspense fallback={<LoadingFallback />}>
          <NotificationsConfigPage />
        </Suspense>
      </AuthenticatedLayout>
    ),
  },
  {
    path: '/app/dashboard',
    element: (
      <AuthenticatedLayout>
        <Suspense fallback={<LoadingFallback />}>
          <DashboardPage />
        </Suspense>
      </AuthenticatedLayout>
    ),
  },
  // Other routes...
])

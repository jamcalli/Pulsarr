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
const UtilitiesPage = lazy(() => import('@/features/utilities'))

const LoadingFallback = () => null

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <Suspense fallback={<LoadingFallback />}>
        <LoginPage />
      </Suspense>
    ),
  },
  {
    path: '/create-user',
    element: (
      <Suspense fallback={<LoadingFallback />}>
        <CreateUserPage />
      </Suspense>
    ),
  },
  {
    path: '/plex',
    element: (
      <AuthenticatedLayout>
        <Suspense fallback={<LoadingFallback />}>
          <PlexConfigPage />
        </Suspense>
      </AuthenticatedLayout>
    ),
  },
  {
    path: '/sonarr',
    element: (
      <AuthenticatedLayout>
        <Suspense fallback={<LoadingFallback />}>
          <SonarrConfigPage />
        </Suspense>
      </AuthenticatedLayout>
    ),
  },
  {
    path: '/radarr',
    element: (
      <AuthenticatedLayout>
        <Suspense fallback={<LoadingFallback />}>
          <RadarrConfigPage />
        </Suspense>
      </AuthenticatedLayout>
    ),
  },
  {
    path: '/notifications',
    element: (
      <AuthenticatedLayout>
        <Suspense fallback={<LoadingFallback />}>
          <NotificationsConfigPage />
        </Suspense>
      </AuthenticatedLayout>
    ),
  },
  {
    path: '/dashboard',
    element: (
      <AuthenticatedLayout>
        <Suspense fallback={<LoadingFallback />}>
          <DashboardPage />
        </Suspense>
      </AuthenticatedLayout>
    ),
  },
  {
    path: '/utilities',
    element: (
      <AuthenticatedLayout>
        <Suspense fallback={<LoadingFallback />}>
          <UtilitiesPage />
        </Suspense>
      </AuthenticatedLayout>
    ),
  },
  // Other routes...
])

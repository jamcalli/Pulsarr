import { lazy, Suspense } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import AuthenticatedLayout from '@/layouts/authenticated'

// Lazy load components
const LoginPage = lazy(() =>
  import('@/pages/login/login').then((module) => ({
    default: module.LoginPage,
  })),
)
const CreateUserPage = lazy(() =>
  import('@/pages/create-user/create-user').then((module) => ({
    default: module.CreateUserPage,
  })),
)
const PlexConfigPage = lazy(() => import('@/pages/plex/plex'))
const SonarrConfigPage = lazy(() => import('@/pages/sonarr/sonarr'))
const RadarrConfigPage = lazy(() => import('@/pages/radarr/radarr'))
const NotificationsConfigPage = lazy(
  () => import('@/pages/notifications/notifications'),
)

// Loading fallback component
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
  // Other routes...
])

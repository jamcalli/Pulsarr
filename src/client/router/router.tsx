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

const PlexConfigPage = lazy(() => import('@/pages/dashboard/plex/plex'))
const SonarrConfigPage = lazy(() => import('@/pages/dashboard/sonarr/sonarr'))
const RadarrConfigPage = lazy(() => import('@/pages/dashboard/radarr/radarr'))

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
    path: '/app/dashboard/plex',
    element: (
      <AuthenticatedLayout>
        <Suspense fallback={<LoadingFallback />}>
          <PlexConfigPage />
        </Suspense>
      </AuthenticatedLayout>
    ),
  },
  {
    path: '/app/dashboard/sonarr',
    element: (
      <AuthenticatedLayout>
        <Suspense fallback={<LoadingFallback />}>
          <SonarrConfigPage />
        </Suspense>
      </AuthenticatedLayout>
    ),
  },
  {
    path: '/app/dashboard/radarr',
    element: (
      <AuthenticatedLayout>
        <Suspense fallback={<LoadingFallback />}>
          <RadarrConfigPage />
        </Suspense>
      </AuthenticatedLayout>
    ),
  },
  // Other routes...
])

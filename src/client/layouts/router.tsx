import { createBrowserRouter } from 'react-router-dom'
import { LoginPage } from '@/pages/login/login'
import { CreateUserPage } from '@/pages/create-user/create-user'
import PlexConfigPage from '@/pages/dashboard/plex/plex'

export const router = createBrowserRouter([
  {
    path: '/app/login',
    element: <LoginPage />,
  },
  {
    path: '/app/create-user',
    element: <CreateUserPage />,
  },
  {
    path: '/app/dashboard/plex',
    element: <PlexConfigPage />,
  },
  // Other routes...
])

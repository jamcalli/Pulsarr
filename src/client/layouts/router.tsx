import { createBrowserRouter } from 'react-router-dom'
import { LoginPage } from '@/pages/login/login'
import { CreateUserPage } from '@/pages/create-user/create-user'

export const router = createBrowserRouter([
  {
    path: '/app/login',
    element: <LoginPage />,
  },
  {
    path: '/app/create-user',
    element: <CreateUserPage />,
  },
  // Other routes...
])

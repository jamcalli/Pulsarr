import { createBrowserRouter, Navigate } from 'react-router-dom'
import { LoginPage } from '@/pages/login/login'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/app/login" replace />,
  },
  {
    path: '/app/login',
    element: <LoginPage />,
  },
  // Other routes...
])

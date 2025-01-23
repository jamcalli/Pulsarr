import { createBrowserRouter, Navigate } from 'react-router-dom'
import { LoginPage } from '@/pages/login/login'

export const router = createBrowserRouter([
 {
   path: "/",
   element: <Navigate to="/login" replace />,
 },
 {
   path: "/login",
   element: <LoginPage />,
 },
 // Other routes...
])
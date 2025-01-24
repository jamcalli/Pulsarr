import './styles/globals.css'
import './styles/fonts.css'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/toaster'
import { RouterProvider } from 'react-router-dom'
import { router } from '@/layouts/router'

function RootLayout() {
  return (
    <ThemeProvider>
      <main className="min-h-screen">
        <RouterProvider router={router} />
      </main>
      <Toaster />
    </ThemeProvider>
  )
}

const rootElement = document.getElementById('app')
if (rootElement === null) throw new Error('Root element not found')

const root = createRoot(rootElement)
root.render(<RootLayout />)
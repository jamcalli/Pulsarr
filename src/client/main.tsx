import './styles/globals.css'
import './styles/fonts.css'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/toaster'
import  ParallaxStarfield from '@/components/ui/starfield'
import { RouterProvider } from 'react-router-dom'
import { router } from '@/layouts/router'

function RootLayout() {
  return (
    <ThemeProvider>
      <ParallaxStarfield>
        <main className="min-h-screen w-full flex items-center justify-center">
          <RouterProvider router={router} />
        </main>
      </ParallaxStarfield>
      <Toaster />
    </ThemeProvider>
  )
}

const rootElement = document.getElementById('app')
if (rootElement === null) throw new Error('Root element not found')

const root = createRoot(rootElement)
root.render(<RootLayout />)

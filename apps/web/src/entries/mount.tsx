import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { Direction } from 'radix-ui'
import { createBrowserRouter, Outlet, RouterProvider, type RouteObject } from 'react-router'
import { AppErrorBoundary, RouteErrorFallback } from '@/components/layout/AppErrorBoundary'
import { SessionSync } from '@/components/layout/SessionSync'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { registerServiceWorker } from '@/lib/pwa'
import { queryClient } from '@/lib/query'
import { NotFound } from '@/pages/NotFound'
import '@/index.css'

interface MountOptions {
  /** Only this app's routes (absolute paths, e.g. `/app/...`). */
  routes: RouteObject[]
  /** This app's root — target of the NotFound / error "home" links (full navigation). */
  homeHref: string
  /** Keep the persisted user in sync with `/auth/me` (authenticated apps). */
  session?: boolean
}

function AppRoot({ session }: { session: boolean }) {
  return (
    <>
      {session && <SessionSync />}
      <Outlet />
    </>
  )
}

/** Boots one installable app: its own router + NotFound + error boundary + shared providers. */
export function mountApp({ routes, homeHref, session = true }: MountOptions) {
  const router = createBrowserRouter([
    {
      element: <AppRoot session={session} />,
      errorElement: <RouteErrorFallback homeHref={homeHref} />,
      children: [...routes, { path: '*', element: <NotFound homeHref={homeHref} /> }],
    },
  ])

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppErrorBoundary homeHref={homeHref}>
        <Direction.Provider dir="rtl">
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <RouterProvider router={router} />
              <Toaster />
            </TooltipProvider>
          </QueryClientProvider>
        </Direction.Provider>
      </AppErrorBoundary>
    </StrictMode>,
  )

  registerServiceWorker()
}

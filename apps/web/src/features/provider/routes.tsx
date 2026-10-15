import { Navigate, type RouteObject } from 'react-router'
import { RequireRole } from '@/components/auth/RequireRole'
import { JobScreen } from './JobScreen'
import { JobsScreen } from './JobsScreen'
import { NotificationsScreen } from './NotificationsScreen'
import { PricesScreen } from './PricesScreen'
import { ProfileScreen } from './ProfileScreen'
import { ProviderLogin } from './ProviderLogin'
import { ProviderShell } from './ProviderShell'

export const providerRoutes: RouteObject[] = [
  { path: '/provider/login', element: <ProviderLogin /> },
  {
    path: '/provider',
    element: <RequireRole roles={['provider']} loginPath="/provider/login" />,
    children: [
      {
        element: <ProviderShell />,
        children: [
          { index: true, element: <JobsScreen /> },
          { path: 'jobs/:id', element: <JobScreen /> },
          { path: 'prices', element: <PricesScreen /> },
          { path: 'notifications', element: <NotificationsScreen /> },
          { path: 'me', element: <ProfileScreen /> },
          { path: '*', element: <Navigate to="/provider" replace /> },
        ],
      },
    ],
  },
]

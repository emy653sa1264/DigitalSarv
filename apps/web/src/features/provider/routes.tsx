import { Navigate, type RouteObject } from 'react-router'
import { RequireRole } from '@/components/auth/RequireRole'
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
          { index: true, element: <Navigate to="/provider/me" replace /> },
          { path: 'me', element: <ProfileScreen /> },
          { path: '*', element: <Navigate to="/provider" replace /> },
        ],
      },
    ],
  },
]

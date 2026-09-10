import { Navigate, type RouteObject } from 'react-router'
import { RequireRole } from '@/components/auth/RequireRole'
import { CourierLogin } from './CourierLogin'
import { CourierShell } from './CourierShell'
import { MeScreen } from './MeScreen'
import { TaskIndex, TaskScreen } from './TaskScreen'
import { TodayScreen } from './TodayScreen'
import { VerifyIndex, VerifyScreen } from './VerifyScreen'

export const courierRoutes: RouteObject[] = [
  { path: '/courier/login', element: <CourierLogin /> },
  {
    path: '/courier',
    element: <RequireRole roles={['courier']} loginPath="/courier/login" />,
    children: [
      {
        element: <CourierShell />,
        children: [
          { index: true, element: <TodayScreen /> },
          { path: 'task', element: <TaskIndex /> },
          { path: 'task/:orderId', element: <TaskScreen /> },
          { path: 'verify', element: <VerifyIndex /> },
          { path: 'verify/:orderId', element: <VerifyScreen /> },
          { path: 'me', element: <MeScreen /> },
          { path: '*', element: <Navigate to="/courier" replace /> },
        ],
      },
    ],
  },
]

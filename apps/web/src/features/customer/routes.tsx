import { Navigate, type RouteObject } from 'react-router'
import { RequireRole } from '@/components/auth/RequireRole'
import { AppLayout } from './layout/AppLayout'
import { CustomerShell } from './layout/CustomerShell'
import { CartScreen } from './screens/CartScreen'
import { ChildEditorScreen, ChildNewScreen } from './screens/ChildScreens'
import { DocsScreen } from './screens/DocsScreen'
import { DoneScreen } from './screens/DoneScreen'
import { FamilyScreen } from './screens/FamilyScreen'
import { FlyerScreen } from './screens/FlyerScreen'
import { HomeScreen } from './screens/HomeScreen'
import { LoginScreen } from './screens/LoginScreen'
import { MembershipScreen } from './screens/MembershipScreen'
import { NotificationsScreen } from './screens/NotificationsScreen'
import { OrdersScreen } from './screens/OrdersScreen'
import { PayReturnScreen } from './screens/PayReturnScreen'
import { PayScreen } from './screens/PayScreen'
import { PickupScreen } from './screens/PickupScreen'
import { PrintScreen } from './screens/PrintScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { RepairScreen } from './screens/RepairScreen'
import { SummaryScreen } from './screens/SummaryScreen'
import { TrackLatestScreen, TrackScreen } from './screens/TrackScreens'

export const customerRoutes: RouteObject[] = [
  {
    path: '/app',
    element: <CustomerShell />,
    children: [
      { path: 'login', element: <LoginScreen /> },
      {
        element: <RequireRole roles={['customer']} loginPath="/app/login" />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { index: true, element: <HomeScreen /> },
              { path: 'family', element: <FamilyScreen /> },
              { path: 'child/new', element: <ChildNewScreen /> },
              { path: 'child/:index', element: <ChildEditorScreen /> },
              { path: 'summary', element: <SummaryScreen /> },
              { path: 'pickup', element: <PickupScreen /> },
              { path: 'membership', element: <MembershipScreen /> },
              { path: 'pay', element: <PayScreen /> },
              { path: 'pay/return', element: <PayReturnScreen /> },
              { path: 'done/:id', element: <DoneScreen /> },
              { path: 'track', element: <TrackLatestScreen /> },
              { path: 'track/:id', element: <TrackScreen /> },
              { path: 'print', element: <PrintScreen /> },
              { path: 'docs', element: <DocsScreen /> },
              { path: 'flyer', element: <FlyerScreen /> },
              { path: 'cart', element: <CartScreen /> },
              { path: 'repair', element: <RepairScreen /> },
              { path: 'me', element: <ProfileScreen /> },
              { path: 'orders', element: <OrdersScreen /> },
              { path: 'notifications', element: <NotificationsScreen /> },
              { path: '*', element: <Navigate to="/app" replace /> },
            ],
          },
        ],
      },
    ],
  },
]

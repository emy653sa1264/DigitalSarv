import { Navigate, type RouteObject } from 'react-router'
import { RequireRole } from '@/components/auth/RequireRole'
import { AdminLayout } from './layout/AdminLayout'
import { CampaignsPage } from './pages/CampaignsPage'
import { CatalogPage } from './pages/CatalogPage'
import { CentersPage } from './pages/CentersPage'
import { CmsPage } from './pages/CmsPage'
import { CouriersPage } from './pages/CouriersPage'
import { CustomersPage } from './pages/CustomersPage'
import { DashboardPage } from './pages/DashboardPage'
import { AdminLoginPage } from './pages/LoginPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { OrdersPage } from './pages/OrdersPage'
import { PricesPage } from './pages/PricesPage'
import { ProductionPage } from './pages/ProductionPage'
import { RulesPage } from './pages/RulesPage'

export const adminRoutes: RouteObject[] = [
  { path: '/admin/login', element: <AdminLoginPage /> },
  {
    path: '/admin',
    element: <RequireRole roles={['admin']} loginPath="/admin/login" />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'orders', element: <OrdersPage /> },
          { path: 'production', element: <ProductionPage /> },
          { path: 'services', element: <CatalogPage /> },
          { path: 'prices', element: <PricesPage /> },
          { path: 'rules', element: <RulesPage /> },
          { path: 'campaigns', element: <CampaignsPage /> },
          { path: 'customers', element: <CustomersPage /> },
          { path: 'couriers', element: <CouriersPage /> },
          { path: 'centers', element: <CentersPage /> },
          { path: 'cms', element: <CmsPage /> },
          { path: 'notifications', element: <NotificationsPage /> },
          { path: '*', element: <Navigate to="/admin" replace /> },
        ],
      },
    ],
  },
]

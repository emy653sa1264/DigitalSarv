import { adminRoutes } from '@/features/admin/routes'
import { mountApp } from './mount'

mountApp({ routes: adminRoutes, homeHref: '/admin' })

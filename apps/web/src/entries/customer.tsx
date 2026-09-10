import { customerRoutes } from '@/features/customer/routes'
import { mountApp } from './mount'

mountApp({ routes: customerRoutes, homeHref: '/app' })

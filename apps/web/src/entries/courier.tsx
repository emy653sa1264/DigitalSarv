import { courierRoutes } from '@/features/courier/routes'
import { mountApp } from './mount'

mountApp({ routes: courierRoutes, homeHref: '/courier' })

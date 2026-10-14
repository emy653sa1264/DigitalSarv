import { providerRoutes } from '@/features/provider/routes'
import { mountApp } from './mount'

mountApp({ routes: providerRoutes, homeHref: '/provider' })

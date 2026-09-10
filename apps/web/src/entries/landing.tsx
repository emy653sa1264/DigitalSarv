import { landingRoutes } from '@/features/landing/routes'
import { mountApp } from './mount'

mountApp({ routes: landingRoutes, homeHref: '/', session: false })

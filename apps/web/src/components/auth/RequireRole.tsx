import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import type { Role } from '@/lib/types'
import { useAuth } from '@/stores/auth'

/** Gate a route subtree by role; unauthenticated/unauthorized users go to `loginPath` with `state.from`. */
export function RequireRole({ roles, loginPath, children }: { roles: Role[]; loginPath: string; children?: ReactNode }) {
  const token = useAuth((s) => s.token)
  const user = useAuth((s) => s.user)
  const location = useLocation()

  if (!token || !user || !roles.includes(user.role)) {
    return <Navigate to={loginPath} replace state={{ from: location.pathname + location.search }} />
  }
  return children ?? <Outlet />
}

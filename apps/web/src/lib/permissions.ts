import type { Permission, User } from '@/lib/types'
import { useAuth } from '@/stores/auth'

/** An admin without `permissions` is a super-admin (contract v4.0). */
export const isSuperAdmin = (u: User | null | undefined) => !!u && u.role === 'admin' && !u.permissions

export function can(u: User | null | undefined, ...required: Permission[]): boolean {
  if (!u || u.role !== 'admin') return false
  if (!u.permissions) return true
  return required.every((p) => u.permissions!.includes(p))
}

/** UI gating only — the API enforces every permission itself. */
export function useCan(...required: Permission[]): boolean {
  const user = useAuth((s) => s.user)
  return can(user, ...required)
}

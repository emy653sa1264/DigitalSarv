/** v4.4 (D36, S5): one persisted session per installable app, chosen by the page's `body[data-role]`. */
import type { Role } from '@/lib/types'

export type AppKey = 'app' | 'courier' | 'provider' | 'admin'
export const LEGACY_SESSION_KEY = 'sarv-auth'

/** Landing (`/`) and the customer app (`/app`) both carry `data-role="customer"`: they share the customer's session. */
const BY_BODY_ROLE: Record<string, AppKey> = { customer: 'app', courier: 'courier', provider: 'provider', admin: 'admin' }
const ROLE_OF: Record<AppKey, Role> = { app: 'customer', courier: 'courier', provider: 'provider', admin: 'admin' }

export const sessionKey = (app: AppKey) => `sarv-auth:${app}`
/** The only user role this app accepts; a stored session of any other role is treated as signed out. */
export const roleOfApp = (app: AppKey): Role => ROLE_OF[app]

export function currentApp(): AppKey {
  const role = typeof document === 'undefined' ? undefined : document.body?.dataset.role
  return BY_BODY_ROLE[role ?? ''] ?? 'app'
}

/**
 * One-time move of the pre-v4.4 shared session: only into the app of its user's role (an admin session goes to `/admin`,
 * never to the customer app), then the legacy key is removed. Any other legacy session waits for its own app.
 * The legacy key is removed only by the matching app, so no app ever adopts another role's session; idempotent
 * (an app whose own key is already filled never touches the legacy key).
 */
export function migrateLegacySession(app: AppKey, storage: Storage): void {
  try {
    if (storage.getItem(sessionKey(app))) return
    const raw = storage.getItem(LEGACY_SESSION_KEY)
    if (!raw) return
    const role = (JSON.parse(raw) as { state?: { user?: { role?: string } | null } })?.state?.user?.role
    if (role !== ROLE_OF[app]) return
    storage.setItem(sessionKey(app), raw)
    storage.removeItem(LEGACY_SESSION_KEY)
  } catch {
    // unreadable or blocked storage: the app simply starts signed out
  }
}

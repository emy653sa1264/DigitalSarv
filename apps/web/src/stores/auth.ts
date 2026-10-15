import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/lib/types'
import { currentApp, migrateLegacySession, roleOfApp, sessionKey } from './session-key'

interface AuthState {
  token: string | null
  user: User | null
  setSession: (token: string, user: User) => void
  setUser: (user: User) => void
  logout: () => void
}

/** D36: this app's own session (`sarv-auth:app` / `:courier` / `:provider` / `:admin`); signing in elsewhere never touches it. */
const APP = currentApp()
try {
  migrateLegacySession(APP, window.localStorage)
} catch {
  // storage access itself can throw (blocked site data)
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: (token, user) => set({ token, user }),
      setUser: (user) => set({ user }),
      logout: () => set({ token: null, user: null }),
    }),
    {
      name: sessionKey(APP),
      // a token whose user has another role than this app — or a token without a user — is never used: start signed out
      merge: (persisted, current) => {
        const p = persisted as Partial<AuthState> | undefined
        if (!p) return current
        return !p.user || p.user.role !== roleOfApp(APP) ? current : { ...current, ...p }
      },
    },
  ),
)

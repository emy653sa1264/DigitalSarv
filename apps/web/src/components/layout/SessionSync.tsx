import { useEffect } from 'react'
import { useMe } from '@/lib/query'
import { useAuth } from '@/stores/auth'

/** Keeps the persisted user in sync with /auth/me. */
export function SessionSync() {
  const { data } = useMe()
  const setUser = useAuth((s) => s.setUser)
  useEffect(() => {
    if (data) setUser(data)
  }, [data, setUser])
  return null
}

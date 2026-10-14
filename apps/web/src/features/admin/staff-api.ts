import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notify } from '@/components/ui/sonner'
import { api } from '@/lib/api'
import { qk } from '@/lib/query'
import type { Permission, StaffMember, User } from '@/lib/types'
import { useAuth } from '@/stores/auth'

export const sk = { all: ['admin', 'staff'] as const }
export interface StaffBody { phone?: string; name?: string; permissions?: Permission[] | null }

export const useStaff = (enabled: boolean) => useQuery({ queryKey: sk.all, enabled, queryFn: () => api.get<StaffMember[]>('/admin/staff') })

export function useStaffMutations() {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: sk.all })
  /** Editing your own access: reload the session user so the menu reflects it (a 401 logs out in api.ts). */
  const syncSelf = async (id: string) => {
    if (useAuth.getState().user?.id !== id) return
    try {
      const me = await api.get<User>('/auth/me')
      useAuth.getState().setUser(me)
      qc.setQueryData(qk.me, me)
    } catch {
      // session revoked server-side: api.ts already logged out and RequireRole redirects to login
    }
  }
  return {
    create: useMutation({ mutationFn: (b: StaffBody) => api.post<StaffMember>('/admin/staff', b), onSuccess: async () => { notify('مدیر اضافه شد'); await refresh() } }),
    update: useMutation({
      mutationFn: ({ id, ...b }: StaffBody & { id: string }) => api.patch<StaffMember>(`/admin/staff/${id}`, b),
      // toast here, not per call: editing your own access can log you out and unmount the dialog before a per-call callback runs
      onSuccess: async (_d, v) => { notify('تغییرات ذخیره شد'); await syncSelf(v.id); await refresh() },
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.del<{ ok: true }>(`/admin/staff/${id}`),
      onSuccess: async (_d, id) => { notify('دسترسی مدیر حذف شد'); await syncSelf(id); await refresh() },
    }),
  }
}

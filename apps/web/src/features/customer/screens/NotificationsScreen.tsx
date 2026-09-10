import { useNavigate } from 'react-router'
import { Bell } from 'lucide-react'
import { EmptyState, ErrorState, LoadingBlock } from '@/components/brand'
import { notify } from '@/components/ui/sonner'
import { fa, jalali, jalaliDayTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Screen } from '../components/Screen'
import { useMarkRead, useNotifications } from '../hooks/notifications'

/** `/app/notifications` — order updates (in-app inbox; SMS is only for the login code). */
export function NotificationsScreen() {
  const navigate = useNavigate()
  const list = useNotifications()
  const markRead = useMarkRead()
  const unread = list.data?.unread ?? 0

  const open = (id: string, orderId: string, read: boolean) => {
    if (!read) markRead.mutate([id])
    navigate(`/app/track/${orderId}`)
  }

  return (
    <Screen title="اعلان‌ها" subtitle={unread ? `${fa(unread)} خوانده‌نشده` : 'به‌روزرسانی سفارش‌ها'} icon={Bell} back="/app">
      {list.isPending ? (
        <LoadingBlock rows={4} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title="اعلانی ندارید" hint="تغییر وضعیت سفارش‌ها اینجا و در اعلان‌های مرورگر نمایش داده می‌شود." />
      ) : (
        <>
          <div className="mb-2.5 flex items-center justify-between gap-2.5">
            <span className="text-xs text-muted-2">جدیدترین‌ها در بالا</span>
            <button
              type="button"
              disabled={!unread || markRead.isPending}
              onClick={() => markRead.mutate(undefined, { onSuccess: () => notify('همه اعلان‌ها خوانده شد') })}
              className="cursor-pointer rounded-full bg-blue-soft px-3.5 py-2 text-[12.5px] font-extrabold text-blue-dark hover:bg-[#d3e0fb] disabled:cursor-default disabled:opacity-50"
            >
              همه خوانده شد
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {list.data.items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => open(n.id, n.orderId, n.read)}
                className={cn(
                  'flex w-full cursor-pointer items-start gap-3 rounded-[20px] border p-3.5 text-start hover:bg-[#f7f9ff]',
                  n.read ? 'border-line bg-white/70' : 'border-[#c9d8ff] bg-white',
                )}
              >
                <span className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', n.read ? 'bg-[#d3d9e8]' : 'bg-accent')} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn('text-[13.5px]', n.read ? 'font-bold text-muted-1' : 'font-extrabold text-ink')}>سفارش {fa(n.orderCode)}</span>
                    <span className="shrink-0 text-[11px] text-muted-2">
                      {jalali(n.createdAt, { day: 'numeric', month: 'long' })} · {jalaliDayTime(n.createdAt)}
                    </span>
                  </span>
                  <span className={cn('mt-1 block text-[13px] leading-[1.7]', n.read ? 'text-muted-2' : 'text-ink')}>{n.text}</span>
                  {!n.read && <span className="sr-only">خوانده‌نشده</span>}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </Screen>
  )
}

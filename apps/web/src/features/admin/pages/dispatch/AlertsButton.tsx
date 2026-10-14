import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { fa } from '@/lib/format'
import { useInbox, useInboxUnread, useMarkInboxRead } from '@/lib/notifications'
import { cn } from '@/lib/utils'
import { when } from './format'

export function AlertsButton({ onOpen }: { onOpen: (jobId: string) => void }) {
  const unread = useInboxUnread('admin')
  const inbox = useInbox('admin')
  const markRead = useMarkInboxRead('admin')
  const items = inbox.data?.items ?? []
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" aria-label="هشدارهای تخصیص">
          <Bell className="size-4" strokeWidth={2.4} />
          هشدارها
          {unread > 0 && <span className="rounded-full bg-pink px-2 py-0.5 text-[11px] font-black text-white">{fa(unread)}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent data-role="admin" align="end" className="w-[340px] max-w-[92vw] rounded-[22px] border-line bg-white p-2">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-[14px] font-black">هشدارهای تخصیص</span>
          {unread > 0 && (
            <button type="button" className="cursor-pointer text-[12px] font-bold text-accent" onClick={() => markRead.mutate(undefined)}>همه خوانده شد</button>
          )}
        </div>
        <div className="grid max-h-[360px] gap-1 overflow-y-auto">
          {inbox.isPending ? (
            <div className="p-4 text-center text-[12.5px] text-muted-2">در حال بارگذاری…</div>
          ) : inbox.isError ? (
            <div className="p-4 text-center text-[12.5px] text-pink-dark">دریافت هشدارها ناموفق بود</div>
          ) : items.length === 0 ? (
            <div className="p-4 text-center text-[12.5px] text-muted-2">هشداری نیست</div>
          ) : (
            items.map((n) => (
              <button key={n.id} type="button"
                onClick={() => { if (!n.read) markRead.mutate([n.id]); if (n.jobId) onOpen(n.jobId) }}
                className={cn('cursor-pointer rounded-[14px] p-2.5 text-start hover:bg-accent-soft/60', !n.read && 'bg-pink-soft/50')}>
                <div className="text-[12.5px] leading-6 font-bold">{n.text}</div>
                <div className="mt-0.5 text-[11px] text-muted-2">سفارش {fa(n.orderCode)} · {when(n.createdAt)}</div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

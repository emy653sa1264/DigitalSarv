import { useNavigate } from 'react-router'
import { Bell } from 'lucide-react'
import { EmptyState, LoadingBlock, MobileHeader, Panel, ScreenBody } from '@/components/brand'
import { PushRow } from '@/components/notifications/PushRow'
import { fa, faText, when } from '@/lib/format'
import { useInbox, useMarkInboxRead } from '@/lib/notifications'
import { cn } from '@/lib/utils'
import { ProviderError } from './ProviderError'

/** D19: provider notifications = in-app inbox + browser push (no SMS). */
export function NotificationsScreen() {
  const navigate = useNavigate()
  const inbox = useInbox('provider')
  const markRead = useMarkInboxRead('provider')
  const unread = inbox.data?.unread ?? 0
  return (
    <>
      <MobileHeader title="اعلان‌ها" subtitle={unread ? `${fa(unread)} خوانده‌نشده` : 'همه خوانده شده'} icon={Bell} tone="cyan"
        actions={unread > 0 ? <button type="button" className="cursor-pointer text-[12px] font-extrabold text-accent" onClick={() => markRead.mutate(undefined)}>همه خوانده شد</button> : undefined} />
      <ScreenBody>
        <Panel><PushRow /></Panel>
        {inbox.isPending ? <LoadingBlock rows={4} className="mt-3" />
          : inbox.isError ? <div className="mt-3"><ProviderError error={inbox.error} onRetry={() => void inbox.refetch()} /></div>
          : inbox.data.items.length === 0 ? <EmptyState className="mt-3" title="اعلانی ندارید" />
          : (
            <div className="mt-3 grid gap-2">
              {inbox.data.items.map((n) => (
                <button key={n.id} type="button" onClick={() => { if (!n.read) markRead.mutate([n.id]); navigate(n.url) }}
                  className={cn('cursor-pointer rounded-[20px] border border-line bg-white p-3.5 text-start', !n.read && 'border-cyan/40 bg-cyan-soft/40')}>
                  <div className="text-[13.5px] font-bold">{faText(n.text)}</div>
                  <div className="mt-1 text-[11.5px] text-muted-2">{n.orderCode ? `سفارش ${fa(n.orderCode)} · ` : ''}{when(n.createdAt)}</div>
                </button>
              ))}
            </div>
          )}
      </ScreenBody>
    </>
  )
}

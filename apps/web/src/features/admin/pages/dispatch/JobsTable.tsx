import type { ReactNode } from 'react'
import { TONES } from '@/components/brand'
import { DELIVERY_METHOD_LABEL, JOB_STATUS_LABEL, JOB_STATUS_TONE, PRIORITY_LABEL, PRIORITY_TONE } from '@/lib/dispatch-labels'
import { fa } from '@/lib/format'
import type { DispatchJobRow } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Tag } from '../../components/controls'
import { AdminRow, AdminTable } from '../../components/table'
import { when } from './format'

const COLUMNS = '96px minmax(0,1.3fr) minmax(0,1.3fr) 150px 140px 150px 80px'
const EXCEPTION = { rejected: 'رد شد', timeout: 'بی‌پاسخ', failed: 'ناموفق', unassigned: 'لغو تخصیص' } as const

export function JobsTable({ rows, onOpen, footer }: { rows: DispatchJobRow[]; onOpen: (id: string) => void; footer?: ReactNode }) {
  return (
    <AdminTable columns={COLUMNS} minWidth={1000} head={['سفارش', 'مشتری و اقلام', 'مجری', 'وضعیت', 'تحویل', 'مهلت', 'اولویت']} footer={footer}>
      {rows.map((r) => {
        const st = TONES[JOB_STATUS_TONE[r.status]]
        const pr = TONES[PRIORITY_TONE[r.priority]]
        return (
          <AdminRow key={r.id} onClick={() => onOpen(r.id)} className="py-3">
            <span className="font-black">{fa(r.orderCode)}</span>
            <span className="min-w-0">
              <span className="block truncate font-bold">{r.customerName}</span>
              <span className="block truncate text-[11.5px] text-muted-2">{r.summary}</span>
            </span>
            <span className="min-w-0 text-[12.5px]">
              {r.provider ? <span className="block truncate font-bold">{r.provider.name}</span> : <span className="text-muted-2">—</span>}
              {r.lastException && (
                <span className="block truncate text-[11.5px] font-bold text-pink-dark">
                  {EXCEPTION[r.lastException.kind]}: {r.lastException.providerName}{r.lastException.reason ? ` — ${r.lastException.reason}` : ''}
                </span>
              )}
              {r.respondBy && <span className="block text-[11.5px] text-muted-2">پاسخ تا {when(r.respondBy)}</span>}
            </span>
            <span><Tag bg={st.soft} fg={st.ink}>{JOB_STATUS_LABEL[r.status]}</Tag></span>
            <span className="text-[12.5px] leading-6">
              {DELIVERY_METHOD_LABEL[r.deliveryMethod]}
              {r.deliveryProvider && r.deliveryProvider.id !== r.provider?.id && <span className="block text-[11.5px] text-muted-2">{r.deliveryProvider.name}</span>}
            </span>
            <span className={cn('text-[12.5px] font-bold', r.late ? 'text-pink-dark' : 'text-muted-1')}>
              {when(r.deadline)}{r.late && <span className="block text-[11.5px]">دیرکرد</span>}
            </span>
            <span><Tag bg={pr.soft} fg={pr.ink}>{PRIORITY_LABEL[r.priority]}</Tag></span>
          </AdminRow>
        )
      })}
    </AdminTable>
  )
}

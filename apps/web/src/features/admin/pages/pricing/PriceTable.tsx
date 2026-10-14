import { TONES } from '@/components/brand'
import { fa, money } from '@/lib/format'
import { NO_PROVIDER_PRICE } from '@/lib/provider-labels'
import type { MatrixRow, PriceLayer, PriceVersionView } from '@/lib/types'
import { IconAction, Tag } from '../../components/controls'
import { AdminRow, AdminTable } from '../../components/table'
import { MODE_LABEL, STATUS_LABEL, STATUS_TONE, safeJalali } from './labels'

const COLUMNS = 'minmax(200px,2.2fr) minmax(130px,1.2fr) minmax(130px,1.1fr) 112px 120px'

const missing = (layer: PriceLayer) => (
  <Tag bg="#eef2fb" fg="#4a5268">{layer === 'provider' ? NO_PROVIDER_PRICE : 'ناموجود'}</Tag>
)

function PriceCell({ v, layer, providerNames }: { v: PriceVersionView | null; layer: PriceLayer; providerNames?: Map<string, string> }) {
  if (!v || v.status === 'disabled' || v.unitPrice === null) {
    return (
      <div className="min-w-0">
        {missing(layer)}
        {v?.mode === 'formula' && v.formula && <div dir="ltr" className="mt-1 truncate text-start font-mono text-[11px] text-muted-2" title={v.formula}>{v.formula}</div>}
        {v?.baseProviderId && <div className="mt-1 text-[11px] font-bold text-muted-2">مجری پایه {providerNames?.get(v.baseProviderId) ?? ''} قیمت فعال ندارد</div>}
      </div>
    )
  }
  if (v.mode === 'manual') return <span className="font-extrabold">{money(v.unitPrice)}</span>
  return (
    <div className="min-w-0">
      <div className="font-extrabold">{money(v.unitPrice)}</div>
      <div className="text-[11px] font-bold text-muted-2">
        {MODE_LABEL[v.mode]}
        {v.mode === 'fixed_markup' && v.markup !== undefined && ` (${money(v.markup)})`}
        {v.mode === 'percent_markup' && v.markup !== undefined && ` (${fa(v.markup)}٪)`}
        {v.baseProviderId && ` · ${providerNames?.get(v.baseProviderId) ?? ''}`}
      </div>
      {v.mode === 'formula' && <div dir="ltr" className="truncate text-start font-mono text-[11px] text-muted-2" title={v.formula}>{v.formula}</div>}
    </div>
  )
}

export function PriceTable({ rows, onEdit, onHistory, layer = 'customer', providerNames }: {
  rows: MatrixRow[]; onEdit: (row: MatrixRow) => void; onHistory: (row: MatrixRow) => void; layer?: PriceLayer; providerNames?: Map<string, string>
}) {
  return (
    <AdminTable columns={COLUMNS} minWidth={780} head={['ترکیب', 'قیمت فعلی', 'قیمت بعدی', 'وضعیت', '']}>
      {rows.map((row) => {
        const status = row.current?.status ?? 'disabled'
        const t = TONES[STATUS_TONE[status]]
        return (
          <AdminRow key={row.comboKey}>
            <span className="font-bold">{row.label}</span>
            <PriceCell v={row.current} layer={layer} providerNames={providerNames} />
            {row.next ? (
              <div>
                <div className="font-extrabold">{row.next.status === 'disabled' || row.next.unitPrice === null ? missing(layer) : money(row.next.unitPrice)}</div>
                <div className="text-[11px] font-bold text-muted-2">{safeJalali(row.next.effectiveFrom)}</div>
              </div>
            ) : (
              <span className="text-muted-3">—</span>
            )}
            <span className="grid justify-items-start gap-1">
              <Tag bg={t.soft} fg={t.ink}>{row.hasVersions ? STATUS_LABEL[status] : layer === 'provider' ? NO_PROVIDER_PRICE : 'بدون قیمت'}</Tag>
              {row.pending && <Tag bg={TONES.amber.soft} fg={TONES.amber.ink}>در انتظار تأیید{row.pending.unitPrice !== null ? `: ${money(row.pending.unitPrice)}` : ''}</Tag>}
            </span>
            <div className="flex items-center gap-2">
              <IconAction kind="edit" label={`ویرایش قیمت ${row.label}`} onClick={() => onEdit(row)} />
              <button type="button" onClick={() => onHistory(row)} className="cursor-pointer text-[12.5px] font-extrabold text-blue-dark hover:underline">
                تاریخچه
              </button>
            </div>
          </AdminRow>
        )
      })}
      <div className="border-t border-line-soft px-[18px] py-2.5 text-[11.5px] font-bold text-muted-2">{fa(rows.length)} ترکیب</div>
    </AdminTable>
  )
}

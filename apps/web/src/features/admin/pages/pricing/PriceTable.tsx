import { TONES } from '@/components/brand'
import { fa, money } from '@/lib/format'
import type { MatrixRow, PriceVersionView } from '@/lib/types'
import { IconAction, Tag } from '../../components/controls'
import { AdminRow, AdminTable } from '../../components/table'
import { MODE_LABEL, STATUS_LABEL, STATUS_TONE, safeJalali } from './labels'

const COLUMNS = 'minmax(200px,2.2fr) minmax(130px,1.2fr) minmax(130px,1.1fr) 112px 120px'

function PriceCell({ v }: { v: PriceVersionView | null }) {
  if (!v) return <Tag bg="#eef2fb" fg="#4a5268">ناموجود</Tag>
  if (v.status === 'disabled' || v.unitPrice === null) {
    return v.mode === 'formula' ? <FormulaCell v={v} /> : <Tag bg="#eef2fb" fg="#4a5268">ناموجود</Tag>
  }
  if (v.mode === 'formula') return <FormulaCell v={v} />
  return <span className="font-extrabold">{money(v.unitPrice)}</span>
}

function FormulaCell({ v }: { v: PriceVersionView }) {
  return (
    <div className="min-w-0">
      <div className="font-extrabold">{v.unitPrice === null ? 'ناموجود' : money(v.unitPrice)}</div>
      <div className="text-[11px] font-bold text-muted-2">{MODE_LABEL.formula}</div>
      <div dir="ltr" className="truncate text-start font-mono text-[11px] text-muted-2" title={v.formula}>
        {v.formula}
      </div>
    </div>
  )
}

export function PriceTable({ rows, onEdit, onHistory }: { rows: MatrixRow[]; onEdit: (row: MatrixRow) => void; onHistory: (row: MatrixRow) => void }) {
  return (
    <AdminTable columns={COLUMNS} minWidth={780} head={['ترکیب', 'قیمت فعلی', 'قیمت بعدی', 'وضعیت', '']}>
      {rows.map((row) => {
        const status = row.current?.status ?? 'disabled'
        const t = TONES[STATUS_TONE[status]]
        return (
          <AdminRow key={row.comboKey}>
            <span className="font-bold">{row.label}</span>
            <PriceCell v={row.current} />
            {row.next ? (
              <div>
                <div className="font-extrabold">{row.next.unitPrice === null ? 'ناموجود' : money(row.next.unitPrice)}</div>
                <div className="text-[11px] font-bold text-muted-2">{safeJalali(row.next.effectiveFrom)}</div>
              </div>
            ) : (
              <span className="text-muted-3">—</span>
            )}
            <span>
              <Tag bg={t.soft} fg={t.ink}>
                {STATUS_LABEL[status]}
              </Tag>
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

import { useState } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { DsSwitch, EmptyState, ErrorState, LoadingBlock } from '@/components/brand'
import { notify, toast } from '@/components/ui/sonner'
import { fa, toNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { masterLabel } from '../lib'
import { AddButton, ConfirmDelete, IconAction, MasterToggle, RowInput } from './controls'
import { AdminCard, CardNote, CardTitle } from './kit'

export interface CatalogItem {
  id: string
  name: string
  num: number
  on: boolean
  hex?: string
}
export interface CatalogDraft {
  id?: string
  name: string
  num: number
  hex?: string
}

interface Props {
  title: string
  addLabel: string
  addTone?: 'violet' | 'cyan'
  namePlaceholder: string
  numPlaceholder: string
  /** Colors: show swatch + hex column and a hex input while editing. */
  withHex?: boolean
  cell: (item: CatalogItem) => string
  note?: string
  newItem: Omit<CatalogDraft, 'id'>
  messages: { allOn: string; allOff: string; added: (name: string) => string; removed: (name: string) => string }
  query: UseQueryResult<unknown>
  items: CatalogItem[]
  onSave: (draft: CatalogDraft, done: () => void) => void
  onToggle: (item: CatalogItem, on: boolean, done: () => void) => void
  onToggleAll: (on: boolean, done: () => void) => void
  onRemove: (item: CatalogItem, done: () => void) => void
  busy?: boolean
}

const HEX = /^#[0-9a-fA-F]{3,8}$/

/** One of the "سرویس‌ها و گزینه‌ها" cards: master switch, inline-editable rows, per-row switch. */
export function CatalogCard(props: Props) {
  const { title, addLabel, addTone, withHex, cell, note, newItem, messages, query, items } = props
  const [edit, setEdit] = useState<CatalogDraft | null>(null)
  const anyOn = items.some((i) => i.on)

  const save = () => {
    if (!edit) return
    const name = edit.name.trim() || 'بدون نام'
    if (withHex && !HEX.test(edit.hex ?? '')) {
      toast.error('کد رنگ نامعتبر است (مثلاً #2f6df6)')
      return
    }
    const draft = { ...edit, name }
    props.onSave(draft, () => {
      setEdit(null)
      notify(draft.id ? 'تغییرات ذخیره شد' : messages.added(name))
    })
  }

  const renderEditRow = (key: string) =>
    edit && (
      <div key={key} className="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-t border-line-soft py-2.5">
        {withHex && <span className="size-7 shrink-0 rounded-[10px] shadow-[inset_0_1.5px_0_rgba(255,255,255,0.5),0_4px_9px_rgba(7,9,15,0.22)]" style={{ background: HEX.test(edit.hex ?? '') ? edit.hex : '#fff' }} />}
        <RowInput
          aria-label={props.namePlaceholder}
          placeholder={props.namePlaceholder}
          value={edit.name}
          onChange={(e) => setEdit({ ...edit, name: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          className="flex-[1_1_140px]"
          autoFocus
        />
        {withHex && (
          <RowInput
            aria-label="کد رنگ"
            placeholder="#2f6df6"
            dir="ltr"
            value={edit.hex ?? ''}
            onChange={(e) => setEdit({ ...edit, hex: e.target.value.trim() })}
            className="w-[100px] min-w-[76px] flex-[0_1_100px] text-center text-xs"
          />
        )}
        <RowInput
          aria-label={props.numPlaceholder}
          placeholder={props.numPlaceholder}
          inputMode="numeric"
          value={fa(edit.num)}
          onChange={(e) => setEdit({ ...edit, num: toNum(e.target.value) })}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          className="w-[100px] min-w-[76px] flex-[0_1_100px] text-center"
        />
        <button type="button" onClick={save} disabled={props.busy} className="cursor-pointer rounded-full bg-green px-4 py-[9px] text-[13px] font-extrabold text-white hover:bg-green-dark disabled:opacity-60">
          ذخیره
        </button>
        <button type="button" onClick={() => setEdit(null)} className="cursor-pointer rounded-full bg-line-soft px-4 py-[9px] text-[13px] font-bold text-muted-1 hover:bg-[#e3e8f5]">
          انصراف
        </button>
      </div>
    )

  return (
    <AdminCard>
      <div className="mb-2 flex flex-wrap items-center gap-2.5">
        <CardTitle className="min-w-[110px] flex-1">{title}</CardTitle>
        {items.length > 0 && (
          <MasterToggle
            label={masterLabel(items)}
            checked={anyOn}
            onToggle={() => props.onToggleAll(!anyOn, () => notify(anyOn ? messages.allOff : messages.allOn))}
          />
        )}
        <AddButton tone={addTone} onClick={() => setEdit({ ...newItem })} disabled={!!edit && !edit.id}>
          {addLabel}
        </AddButton>
      </div>

      {query.isPending && <LoadingBlock rows={3} />}
      {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {query.isSuccess && items.length === 0 && !edit && <EmptyState title="موردی ثبت نشده است" hint={`برای شروع «${addLabel}» را بزنید.`} />}

      {items.map((item) =>
        edit?.id === item.id ? (
          renderEditRow(item.id)
        ) : (
          <div key={item.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-t border-line-soft py-2.5">
            {withHex && (
              <span className="size-7 shrink-0 rounded-[10px] shadow-[inset_0_1.5px_0_rgba(255,255,255,0.5),0_4px_9px_rgba(7,9,15,0.22)]" style={{ background: item.hex }} />
            )}
            <span className={cn('min-w-0 flex-[1_1_110px] text-sm font-bold', item.on ? 'text-ink' : 'text-muted-3')}>{item.name}</span>
            {withHex && (
              <span dir="ltr" className="font-mono text-xs whitespace-nowrap text-muted-2">
                {item.hex}
              </span>
            )}
            <span className="rounded-full bg-line-soft px-3 py-1.5 text-[12.5px] font-extrabold whitespace-nowrap text-muted-1">{cell(item)}</span>
            <IconAction kind="edit" label="ویرایش" onClick={() => setEdit({ id: item.id, name: item.name, num: item.num, hex: item.hex })} />
            <ConfirmDelete title={`حذف «${item.name}»؟`} onConfirm={() => props.onRemove(item, () => notify(messages.removed(item.name)))} />
            <DsSwitch
              checked={item.on}
              label={item.name}
              onCheckedChange={(on) => props.onToggle(item, on, () => notify(`${item.name} ${on ? 'روشن' : 'خاموش'} شد`))}
            />
          </div>
        ),
      )}
      {edit && !edit.id && renderEditRow('new')}
      {note && <CardNote>{note}</CardNote>}
    </AdminCard>
  )
}

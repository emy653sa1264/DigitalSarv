import { useState } from 'react'
import { DsSwitch, InfoBanner } from '@/components/brand'
import { notify, toast } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'
import type { NotificationTemplate, OrderStatus } from '@/lib/types'
import { ORDER_STATUS_LABEL } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useNotificationMutations, useNotificationTemplates } from '../api'
import { AddButton, AdminSelect, ConfirmDelete } from '../components/controls'
import { Field, FormDialog } from '../components/FormDialog'
import { PageHeader, QueryView } from '../components/kit'
import { ORDER_STATUSES } from '../lib'

/** v3.3: every template is `push` = in-app inbox + browser push; `sms` rows are legacy (converted by the seed). */
const CHANNEL = {
  push: { label: 'اعلان برنامه + مرورگر', className: 'bg-[#ebe5ff] text-[#4c31b8]' },
  sms: { label: 'پیامک', className: 'bg-[#e3ecff] text-[#1b45b8]' },
} as const

/** Events the server dispatches (everything except the unpaid state). */
const EVENTS: OrderStatus[] = ORDER_STATUSES.filter((s) => s !== 'pending_payment')

export function NotificationsPage() {
  const query = useNotificationTemplates()
  const { update, remove } = useNotificationMutations()
  const [editing, setEditing] = useState<NotificationTemplate>()
  const [adding, setAdding] = useState(false)
  const freeEvents = EVENTS.filter((e) => !(query.data ?? []).some((n) => n.event === e))

  return (
    <>
      <PageHeader
        title="اعلان‌ها"
        subtitle="متن اعلان هر مرحله سفارش قابل ویرایش است؛ هر اعلان را جداگانه روشن یا خاموش کنید."
        actions={
          <AddButton onClick={() => setAdding(true)} disabled={!query.data || freeEvents.length === 0} title={freeEvents.length === 0 ? 'برای همه مراحل اعلان تعریف شده است' : undefined}>
            افزودن اعلان
          </AddButton>
        }
      />
      <InfoBanner className="mb-4">پیامک فقط برای کد ورود ارسال می‌شود؛ وضعیت سفارش به صورت اعلان درون‌برنامه و مرورگر ارسال می‌شود.</InfoBanner>
      <QueryView query={query} rows={6} isEmpty={(d) => d.length === 0} empty={{ title: 'قالب اعلانی تعریف نشده است', hint: 'با «افزودن اعلان» اولین قالب را بسازید.' }}>
        {(list) => (
          <div className="rounded-[26px] border border-line bg-white px-4 py-2 sm:px-5">
            {[...list]
              .sort((a, b) => EVENTS.indexOf(a.event) - EVENTS.indexOf(b.event))
              .map((n) => {
                const ch = CHANNEL[n.channel] ?? CHANNEL.push
                return (
                  <div key={n.id} className="flex flex-wrap items-center gap-3 border-t border-line-soft py-[13px] first:border-t-0 sm:flex-nowrap">
                    <span className={cn('shrink-0 rounded-full px-[11px] py-[5px] text-center text-[11px] font-extrabold', ch.className)}>{ch.label}</span>
                    <div className="min-w-0 flex-1 basis-[200px]">
                      <div className={cn('text-sm font-semibold', !n.on && 'text-muted-3')}>{n.text}</div>
                      <div className="text-[11.5px] text-muted-3">{ORDER_STATUS_LABEL[n.event] ?? n.event}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditing(n)}
                      className="cursor-pointer rounded-full bg-line-soft px-[15px] py-[9px] text-[12.5px] font-bold text-muted-1 hover:bg-blue-soft"
                    >
                      ویرایش متن
                    </button>
                    <ConfirmDelete
                      title={`حذف اعلان «${ORDER_STATUS_LABEL[n.event] ?? n.event}»؟`}
                      description="برای این مرحله دیگر اعلانی ارسال نمی‌شود تا دوباره آن را اضافه کنید."
                      onConfirm={() => remove.mutate(n.id, { onSuccess: () => notify('اعلان حذف شد') })}
                    />
                    <DsSwitch
                      checked={n.on}
                      label={n.text}
                      onCheckedChange={(on) => update.mutate({ id: n.id, on }, { onSuccess: () => notify(on ? 'اعلان فعال شد' : 'اعلان غیرفعال شد') })}
                    />
                  </div>
                )
              })}
          </div>
        )}
      </QueryView>
      <EditTextDialog key={editing?.id ?? 'none'} template={editing} onClose={() => setEditing(undefined)} />
      <AddNotificationDialog key={String(adding)} open={adding} events={freeEvents} onOpenChange={setAdding} />
    </>
  )
}

function EditTextDialog({ template, onClose }: { template?: NotificationTemplate; onClose: () => void }) {
  const [text, setText] = useState(template?.text ?? '')
  const { update } = useNotificationMutations()
  const submit = () => {
    if (!template) return
    if (!text.trim()) {
      toast.error('متن اعلان نمی‌تواند خالی باشد')
      return
    }
    update.mutate(
      { id: template.id, text: text.trim() },
      {
        onSuccess: () => {
          notify('تغییرات ذخیره شد')
          onClose()
        },
      },
    )
  }
  return (
    <FormDialog
      open={!!template}
      onOpenChange={(o) => !o && onClose()}
      title="ویرایش متن اعلان"
      description={template ? `${(CHANNEL[template.channel] ?? CHANNEL.push).label} · ${ORDER_STATUS_LABEL[template.event] ?? template.event}` : undefined}
      pending={update.isPending}
      onSubmit={submit}
    >
      <Field label="متن اعلان">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[120px]" autoFocus />
      </Field>
    </FormDialog>
  )
}

function AddNotificationDialog({ open, events, onOpenChange }: { open: boolean; events: OrderStatus[]; onOpenChange: (o: boolean) => void }) {
  const [event, setEvent] = useState<OrderStatus | undefined>(events[0])
  const [text, setText] = useState('')
  const [on, setOn] = useState(true)
  const { create } = useNotificationMutations()

  const submit = () => {
    if (!event) {
      toast.error('مرحله سفارش را انتخاب کنید')
      return
    }
    if (!text.trim()) {
      toast.error('متن اعلان نمی‌تواند خالی باشد')
      return
    }
    create.mutate(
      { event, text: text.trim(), on },
      {
        onSuccess: () => {
          notify(`اعلان «${ORDER_STATUS_LABEL[event]}» اضافه شد`)
          onOpenChange(false)
        },
      },
    )
  }

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="افزودن اعلان" submitLabel="افزودن" pending={create.isPending} onSubmit={submit}>
      <Field label="مرحله سفارش" hint="فقط مراحلی که هنوز اعلان ندارند.">
        <AdminSelect
          ariaLabel="مرحله سفارش"
          value={event}
          onValueChange={(v) => setEvent(v as OrderStatus)}
          placeholder="انتخاب مرحله"
          options={events.map((e) => ({ value: e, label: ORDER_STATUS_LABEL[e] }))}
        />
      </Field>
      <Field label="متن اعلان">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[110px]" placeholder="مثلاً: سفارش شما آماده ارسال است." />
      </Field>
      <div className="flex items-center justify-between gap-3 rounded-[18px] bg-shell px-4 py-3">
        <span className="text-[13.5px] font-extrabold">فعال</span>
        <DsSwitch checked={on} onCheckedChange={setOn} label="فعال" />
      </div>
    </FormDialog>
  )
}

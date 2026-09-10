import { useState } from 'react'
import { DsSwitch } from '@/components/brand'
import { notify, toast } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'
import type { NotificationTemplate } from '@/lib/types'
import { ORDER_STATUS_LABEL } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useNotificationMutations, useNotificationTemplates } from '../api'
import { Field, FormDialog } from '../components/FormDialog'
import { PageHeader, QueryView } from '../components/kit'

/** Design `notifTemplates[].chStyle`: پیامک = blue soft/ink, پوش = violet soft/ink. */
const CHANNEL = {
  sms: { label: 'پیامک', className: 'bg-[#e3ecff] text-[#1b45b8]' },
  push: { label: 'پوش', className: 'bg-[#ebe5ff] text-[#4c31b8]' },
} as const

export function NotificationsPage() {
  const query = useNotificationTemplates()
  const { update } = useNotificationMutations()
  const [editing, setEditing] = useState<NotificationTemplate>()

  return (
    <>
      <PageHeader title="اعلان‌ها" subtitle="قالب پیام هر مرحله قابل ویرایش است؛ کانال پیامک یا پوش را جداگانه فعال کنید." />
      <QueryView query={query} rows={6} isEmpty={(d) => d.length === 0} empty={{ title: 'قالب اعلانی تعریف نشده است' }}>
        {(list) => (
          <div className="rounded-[26px] border border-line bg-white px-4 py-2 sm:px-5">
            {list.map((n) => {
              const ch = CHANNEL[n.channel] ?? CHANNEL.sms
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
                  <DsSwitch
                    checked={n.on}
                    label={n.text}
                    onCheckedChange={(on) => update.mutate({ id: n.id, on }, { onSuccess: () => notify(on ? `اعلان ${ch.label} فعال شد` : `اعلان ${ch.label} غیرفعال شد`) })}
                  />
                </div>
              )
            })}
          </div>
        )}
      </QueryView>
      <EditTextDialog key={editing?.id ?? 'none'} template={editing} onClose={() => setEditing(undefined)} />
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
      description={template ? `${CHANNEL[template.channel]?.label ?? ''} · ${ORDER_STATUS_LABEL[template.event] ?? template.event}` : undefined}
      pending={update.isPending}
      onSubmit={submit}
    >
      <Field label="متن پیام">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[120px]" autoFocus />
      </Field>
    </FormDialog>
  )
}

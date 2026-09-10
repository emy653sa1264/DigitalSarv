import { useState } from 'react'
import { EmptyState } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { notify } from '@/components/ui/sonner'
import { compactMoney, fa, jalali } from '@/lib/format'
import type { Campaign } from '@/lib/types'
import { useCampaignMutations, useCampaigns } from '../api'
import { ConfirmDelete, IconAction } from '../components/controls'
import { AdminCard, CardTitle, PageHeader, QueryView } from '../components/kit'
import { CAMPAIGN_SERVICE_LABEL, shortToman } from '../lib'
import { CampaignDialog } from './CampaignDialog'

const DAY_MONTH: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }
const range = (c: Campaign) => `${jalali(c.startsAt, DAY_MONTH)} تا ${jalali(c.endsAt, DAY_MONTH)}`
/** "۱ مرداد – ۱۵ شهریور ۱۴۰۵" (design «بازه اجرا»). */
const runRange = (c: Campaign) => `${jalali(c.startsAt, DAY_MONTH)} – ${jalali(c.endsAt)}`
const servicesLabel = (c: Campaign) => (c.services?.length ? c.services.map((s) => CAMPAIGN_SERVICE_LABEL[s] ?? s).join('، ') : '—')

export function CampaignsPage() {
  const query = useCampaigns()
  const { update, remove } = useCampaignMutations()
  const [dialog, setDialog] = useState<{ open: boolean; campaign?: Campaign }>({ open: false })

  const openNew = () => setDialog({ open: true })
  const openEdit = (campaign: Campaign) => setDialog({ open: true, campaign })

  return (
    <>
      <PageHeader title="کمپین‌ها" />
      <QueryView query={query} rows={3}>
        {(list) => {
          const active = list.find((c) => c.active)
          const others = list.filter((c) => c !== active)
          return (
            <>
              {active ? (
                <ActiveCampaign campaign={active} onEdit={() => openEdit(active)} />
              ) : (
                <EmptyState title="هیچ کمپینی فعال نیست" hint="یکی از کمپین‌های زیر را فعال کنید یا کمپین جدیدی بسازید." />
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-[24px] bg-violet-soft p-5">
                <div>
                  <div className="text-[15px] font-extrabold text-[#33208c]">سال آینده؟</div>
                  <div className="mt-1 text-[13px] text-violet-dark">یک کمپین جدید بسازید — بنر، تخفیف، ظرفیت و ساعت‌های تحویل‌گیری همه پارامتر هستند.</div>
                </div>
                <button type="button" onClick={openNew} className="cursor-pointer rounded-full bg-violet-dark px-6 py-3.5 text-sm font-extrabold text-white hover:bg-violet">
                  ساخت کمپین جدید
                </button>
              </div>

              {others.length > 0 && (
                <AdminCard className="mt-4">
                  <CardTitle className="mb-1">کمپین‌های دیگر</CardTitle>
                  {others.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center gap-3 border-t border-line-soft py-3">
                      <div className="min-w-[180px] flex-1">
                        <div className="text-sm font-extrabold">{c.title}</div>
                        <div className="text-[12px] text-muted-2">
                          {range(c)} · {fa(c.stats?.orders ?? 0)} سفارش · {servicesLabel(c)}
                        </div>
                      </div>
                      <span dir="ltr" className="rounded-full bg-line-soft px-3 py-1.5 text-[12px] font-extrabold text-muted-1">
                        {c.code}
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={update.isPending}
                        onClick={() => update.mutate({ id: c.id, active: true }, { onSuccess: () => notify(`کمپین ${c.title} فعال شد`) })}
                      >
                        فعال‌سازی
                      </Button>
                      <IconAction kind="edit" label="ویرایش" onClick={() => openEdit(c)} />
                      <ConfirmDelete title={`حذف کمپین «${c.title}»؟`} onConfirm={() => remove.mutate(c.id, { onSuccess: () => notify('کمپین حذف شد') })} />
                    </div>
                  ))}
                </AdminCard>
              )}
            </>
          )
        }}
      </QueryView>
      <CampaignDialog open={dialog.open} campaign={dialog.campaign} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
    </>
  )
}

function ActiveCampaign({ campaign: c, onEdit }: { campaign: Campaign; onEdit: () => void }) {
  // Design `campFields`, same order and wording.
  const fields = [
    { label: 'بازه اجرا', value: runRange(c) },
    { label: 'ظرفیت روزانه', value: `${fa(c.dailyCapacity)} سفارش` },
    { label: 'ساعت‌های تحویل‌گیری', value: c.pickupHours ? fa(c.pickupHours) : '—' },
    { label: 'تخفیف کمپین', value: `${fa(c.couponPct)} درصد (سقف ${shortToman(c.couponCap)})` },
    { label: 'کوپن فعال', value: <span dir="ltr">{c.code}</span> },
    { label: 'سرویس‌های مشمول', value: servicesLabel(c) },
  ]
  return (
    <>
      <div className="relative flex flex-wrap justify-between gap-5 overflow-hidden rounded-[26px] bg-violet-dark p-6 text-[#d5cbff]">
        <div className="pointer-events-none absolute -top-[60px] -left-[30px] size-[200px] rounded-full bg-[rgba(124,92,245,0.55)]" />
        <div className="relative">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white/20 px-[13px] py-1.5 text-xs font-extrabold text-white">فعال</span>
            <button type="button" onClick={onEdit} className="cursor-pointer rounded-full bg-white/10 px-[13px] py-1.5 text-xs font-extrabold text-white hover:bg-white/25">
              ویرایش
            </button>
          </div>
          <div className="mt-3 text-[26px] font-black text-white">{c.title}</div>
          <div className="mt-1.5 text-sm">
            {range(c)} · ظرفیت روزانه {fa(c.dailyCapacity)} سفارش
          </div>
        </div>
        <div className="relative flex flex-wrap gap-[26px]">
          <Stat label="سفارش‌ها" value={fa(c.stats?.orders ?? 0)} />
          <Stat label="کتاب‌ها" value={fa(c.stats?.books ?? 0)} />
          <Stat label="میانگین سفارش" value={compactMoney(c.stats?.avgOrder ?? 0)} />
        </div>
      </div>
      <div className="mt-4 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) => (
          <div key={f.label} className="rounded-[22px] border border-line bg-white p-4">
            <div className="text-[12.5px] text-muted-2">{f.label}</div>
            <div className="mt-1.5 text-[15px] leading-7 font-extrabold">{f.value}</div>
          </div>
        ))}
      </div>
      {c.bannerNote && (
        <div className="mt-3.5 rounded-[22px] bg-violet-soft px-4 py-3 text-[13px] leading-7 font-semibold text-violet-ink">
          متن بنر: {c.bannerNote}
        </div>
      )}
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[12.5px]">{label}</div>
      <div className="text-2xl font-black text-white">{value}</div>
    </div>
  )
}

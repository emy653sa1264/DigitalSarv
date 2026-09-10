import { useEffect, useRef, useState } from 'react'
import { Chip, DsSwitch } from '@/components/brand'
import { Input } from '@/components/ui/input'
import { notify, toast } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'
import { fa, jalali, toNum } from '@/lib/format'
import type { Campaign, CampaignService } from '@/lib/types'
import { useAdminPrices, useCampaignMutations, type CampaignBody } from '../api'
import { Field, FormDialog } from '../components/FormDialog'
import { CAMPAIGN_SERVICE_LABEL, CAMPAIGN_SERVICES } from '../lib'

/** Contract `DEFAULT_CAMPAIGN_SERVICES` (v3): «فنری کتاب، چاپ اسناد، پایان‌نامه و صحافی». */
const DEFAULT_SERVICES: CampaignService[] = ['school', 'print', 'docs']

interface Form {
  title: string
  code: string
  startsAt: string
  endsAt: string
  couponPct: number
  couponCap: number
  dailyCapacity: number
  bannerNote: string
  pickupHours: string
  services: CampaignService[]
  active: boolean
}

const day = (iso?: string) => (iso ? iso.slice(0, 10) : '')

/** Fallbacks when «قیمت‌ها» (`couponPct` / `couponCap`) is not loaded yet — the contract's seed defaults. */
const COUPON_DEFAULTS = { couponPct: 5, couponCap: 100000 }

function fromCampaign(c?: Campaign, defaults: { couponPct: number; couponCap: number } = COUPON_DEFAULTS): Form {
  const today = new Date().toISOString().slice(0, 10)
  return {
    title: c?.title ?? '',
    code: c?.code ?? '',
    startsAt: day(c?.startsAt) || today,
    endsAt: day(c?.endsAt) || today,
    couponPct: c?.couponPct ?? defaults.couponPct,
    couponCap: c?.couponCap ?? defaults.couponCap,
    dailyCapacity: c?.dailyCapacity ?? 120,
    bannerNote: c?.bannerNote ?? '',
    pickupHours: c?.pickupHours ?? '',
    services: c?.services?.length ? [...c.services] : DEFAULT_SERVICES,
    active: c?.active ?? false,
  }
}

const safeJalali = (d: string) => {
  const date = new Date(d)
  return Number.isNaN(date.getTime()) ? '' : jalali(date)
}

export function CampaignDialog({ open, onOpenChange, campaign }: { open: boolean; onOpenChange: (o: boolean) => void; campaign?: Campaign }) {
  return <CampaignForm key={`${campaign?.id ?? 'new'}-${open}`} open={open} onOpenChange={onOpenChange} campaign={campaign} />
}

function CampaignForm({ open, onOpenChange, campaign }: { open: boolean; onOpenChange: (o: boolean) => void; campaign?: Campaign }) {
  const prices = useAdminPrices()
  const [form, setForm] = useState<Form>(() => fromCampaign(campaign, prices.data))
  const { create, update } = useCampaignMutations()
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  // A new campaign starts with the «قیمت‌ها» defaults; they may arrive after the dialog opened.
  const couponTouched = useRef(false)
  const defaultPct = prices.data?.couponPct
  const defaultCap = prices.data?.couponCap
  useEffect(() => {
    if (campaign || couponTouched.current || defaultPct === undefined || defaultCap === undefined) return
    setForm((f) => ({ ...f, couponPct: defaultPct, couponCap: defaultCap }))
  }, [campaign, defaultPct, defaultCap])
  const setCoupon = (k: 'couponPct' | 'couponCap', v: number) => {
    couponTouched.current = true
    set(k, v)
  }
  const toggleService = (s: CampaignService) =>
    setForm((f) => ({
      ...f,
      // Keep the canonical order so the saved list reads like the design.
      services: f.services.includes(s) ? f.services.filter((x) => x !== s) : CAMPAIGN_SERVICES.filter((x) => x === s || f.services.includes(x)),
    }))

  const submit = () => {
    if (!form.title.trim() || !form.code.trim()) {
      toast.error('عنوان و کد کمپین را وارد کنید')
      return
    }
    if (!form.services.length) {
      toast.error('حداقل یک سرویس مشمول انتخاب کنید')
      return
    }
    if (form.endsAt < form.startsAt) {
      toast.error('تاریخ پایان باید بعد از تاریخ شروع باشد')
      return
    }
    const body: CampaignBody = {
      ...form,
      title: form.title.trim(),
      code: form.code.trim().toUpperCase(),
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: new Date(form.endsAt).toISOString(),
    }
    const done = (msg: string) => () => {
      notify(msg)
      onOpenChange(false)
    }
    if (campaign) update.mutate({ id: campaign.id, ...body }, { onSuccess: done('تغییرات ذخیره شد') })
    else create.mutate(body, { onSuccess: done(`کمپین ${body.title} ساخته شد`) })
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={campaign ? 'ویرایش کمپین' : 'ساخت کمپین جدید'}
      description="بنر، تخفیف، ظرفیت و ساعت‌های تحویل‌گیری همه پارامتر هستند."
      pending={create.isPending || update.isPending}
      onSubmit={submit}
      className="sm:max-w-[600px]"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="عنوان کمپین">
          <Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="اول مهر ۱۴۰۵" />
        </Field>
        <Field label="کد تخفیف">
          <Input dir="ltr" value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="SCHOOL1405" className="text-center font-bold tracking-wider" />
        </Field>
        <Field label="تاریخ شروع" hint={safeJalali(form.startsAt)}>
          <Input type="date" dir="ltr" value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} />
        </Field>
        <Field label="تاریخ پایان" hint={safeJalali(form.endsAt)}>
          <Input type="date" dir="ltr" value={form.endsAt} onChange={(e) => set('endsAt', e.target.value)} />
        </Field>
        <Field label="درصد تخفیف کوپن">
          <Input inputMode="numeric" value={fa(form.couponPct)} onChange={(e) => setCoupon('couponPct', Math.min(100, toNum(e.target.value)))} />
        </Field>
        <Field label="سقف تخفیف (تومان)">
          <Input inputMode="numeric" value={fa(form.couponCap)} onChange={(e) => setCoupon('couponCap', toNum(e.target.value))} />
        </Field>
        <Field label="ظرفیت روزانه (سفارش)" hint="۰ = بدون محدودیت">
          <Input inputMode="numeric" value={fa(form.dailyCapacity)} onChange={(e) => set('dailyCapacity', toNum(e.target.value))} />
        </Field>
        <Field label="ساعت‌های تحویل‌گیری">
          <Input value={form.pickupHours} onChange={(e) => set('pickupHours', e.target.value)} placeholder="۸ تا ۲۰" />
        </Field>
      </div>
      <div className="-mt-1 rounded-[16px] bg-amber-soft px-3.5 py-2.5 text-[12px] leading-6 font-semibold text-amber-ink">
        کد تخفیف فقط وقتی کمپین فعال است، بین تاریخ شروع و پایان (به وقت تهران) و تا سقف ظرفیت روزانه پذیرفته می‌شود. «ساعت‌های تحویل‌گیری» فقط در کارت کمپین نمایش داده می‌شود؛ متن ساعت‌ها و بازه‌های تحویل‌گیری مشتری از «تنظیمات» می‌آید.
      </div>
      <Field label="سرویس‌های مشمول" hint="تخفیف کوپن فقط روی جمع همین سرویس‌ها اعمال می‌شود.">
        <div className="flex flex-wrap gap-2" role="group" aria-label="سرویس‌های مشمول">
          {CAMPAIGN_SERVICES.map((s) => (
            <Chip key={s} size="sm" selected={form.services.includes(s)} onClick={() => toggleService(s)}>
              {CAMPAIGN_SERVICE_LABEL[s]}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="متن بنر">
        <Textarea value={form.bannerNote} onChange={(e) => set('bannerNote', e.target.value)} placeholder="تا ۱۵ شهریور: ۵٪ تخفیف با کد SCHOOL1405" />
      </Field>
      <div className="flex items-center justify-between gap-3 rounded-[18px] bg-shell px-4 py-3">
        <div>
          <div className="text-[13.5px] font-extrabold">کمپین فعال</div>
          <div className="text-[11.5px] text-muted-2">با فعال‌سازی، کمپین فعال قبلی غیرفعال می‌شود.</div>
        </div>
        <DsSwitch checked={form.active} onCheckedChange={(v) => set('active', v)} label="کمپین فعال" />
      </div>
    </FormDialog>
  )
}

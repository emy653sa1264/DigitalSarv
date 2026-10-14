import { type ReactNode } from 'react'
import { Store } from 'lucide-react'
import { InfoBanner, LoadingBlock, MobileHeader, Panel, ScreenBody, ToneTag } from '@/components/brand'
import { fa, money } from '@/lib/format'
import {
  CAPABILITY_ADDON_LABEL, COLOR_TYPE_LABEL, EQUIPMENT_KIND_LABEL, EQUIPMENT_TAG_LABEL, PROVIDER_SERVICE_LABEL, PROVIDER_STATUS, SIDE_LABEL, WEEKDAYS,
} from '@/lib/provider-labels'
import { useCatalog } from '@/lib/query'
import type { ProviderSelf } from '@/lib/types'
import { useProviderMe } from './api'
import { LogoutButton } from './LogoutButton'
import { ProviderError } from './ProviderError'

export function ProfileScreen() {
  const me = useProviderMe()
  return (
    <>
      <MobileHeader title="پروفایل مجری" subtitle={me.data ? fa(me.data.businessName || me.data.name) : 'سرو مجری'} icon={Store} tone="cyan" />
      <ScreenBody>
        {me.isPending ? <LoadingBlock rows={4} /> : me.isError ? <ProviderError error={me.error} onRetry={() => void me.refetch()} /> : <ProfileContent p={me.data} />}
      </ScreenBody>
    </>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel className="mt-3">
      <div className="mb-2 text-[13.5px] font-black">{title}</div>
      <div className="grid gap-1.5 text-[13px] leading-6 text-muted-1">{children}</div>
    </Panel>
  )
}

function ProfileContent({ p }: { p: ProviderSelf }) {
  const catalog = useCatalog()
  const paperName = (key: string) => catalog.data?.papers.find((x) => x.key === key)?.name ?? key
  const st = PROVIDER_STATUS[p.status]
  const hours = WEEKDAYS.map((w) => ({ ...w, ranges: p.workingHours.filter((h) => h.weekday === w.day) }))

  return (
    <>
      <div className="rounded-[24px] bg-night p-5 text-white">
        <div className="text-[20px] font-black">{p.name}</div>
        {p.businessName && <div className="mt-0.5 text-[13px] text-[#9aa2b8]">{fa(p.businessName)}</div>}
        <div className="mt-3 flex flex-wrap gap-2">
          <ToneTag tone={st.tone}>{st.label}</ToneTag>
          <ToneTag tone={p.availableForOrders ? 'green' : 'ink'}>{p.availableForOrders ? 'آماده دریافت سفارش' : 'سفارش جدید نمی‌پذیرد'}</ToneTag>
        </div>
      </div>

      <Section title="اطلاعات تماس">
        {p.contactName && <div>مسئول: {fa(p.contactName)}</div>}
        {p.phone && <div>تلفن: <span dir="ltr" className="inline-block font-bold">{fa(p.phone)}</span></div>}
        {p.address && <div>{fa(p.address)}</div>}
        {!p.contactName && !p.phone && !p.address && <div>ثبت نشده است</div>}
      </Section>

      <Section title="ساعات کاری">
        {p.workingHours.length === 0 ? <div>ثبت نشده است</div> : hours.map((h) => (
          <div key={h.day} className="flex justify-between gap-3">
            <span className="font-bold text-ink">{h.label}</span>
            <span>{h.ranges.length ? h.ranges.map((r) => `${fa(r.from)} تا ${fa(r.to)}`).join('، ') : 'تعطیل'}</span>
          </div>
        ))}
      </Section>

      <Section title="مناطق خدمت و تحویل">
        <div>{p.serviceZones.length ? p.serviceZones.map((z) => z.name).join('، ') : 'منطقه‌ای ثبت نشده است'}</div>
        <div>{p.canDeliver ? `ارسال توسط مجری · هزینه ${p.deliveryFee ? money(p.deliveryFee) : 'رایگان'}` : 'ارسال با پیک دیجیتال سرو'}</div>
        <div>{p.allowCustomerPickup ? 'تحویل حضوری از مجری مجاز است' : 'تحویل حضوری از مجری ندارد'}</div>
      </Section>

      <Section title="ظرفیت">
        {p.capacity.dailySheets !== undefined && <div>روزانه: {fa(p.capacity.dailySheets)} برگ</div>}
        {p.capacity.hourlySheets !== undefined && <div>ساعتی: {fa(p.capacity.hourlySheets)} برگ</div>}
        {p.capacity.perService.map((s) => <div key={s.service}>{PROVIDER_SERVICE_LABEL[s.service]}: {fa(s.perDay)} در روز</div>)}
        {p.capacity.dailySheets === undefined && p.capacity.hourlySheets === undefined && p.capacity.perService.length === 0 && <div>ثبت نشده است</div>}
      </Section>

      <Section title="توانمندی‌ها">
        {p.capabilities.length === 0 ? <div>ثبت نشده است</div> : p.capabilities.map((c) => (
          <div key={c.service}>
            <span className="font-bold text-ink">{PROVIDER_SERVICE_LABEL[c.service]}</span>
            {[c.sizes.join('، '), c.colorTypes.map((t) => COLOR_TYPE_LABEL[t]).join('، '), c.papers.map(paperName).join('، '), c.sides.map((s) => SIDE_LABEL[s]).join('، '), c.addons.map((a) => CAPABILITY_ADDON_LABEL[a]).join('، ')]
              .filter(Boolean).map((part) => ` · ${part}`).join('')}
          </div>
        ))}
      </Section>

      <Section title="تجهیزات">
        {p.equipment.length === 0 ? <div>ثبت نشده است</div> : p.equipment.map((e, i) => (
          <div key={`${e.name}-${i}`}>
            <span className="font-bold text-ink">{e.name}</span> ({EQUIPMENT_KIND_LABEL[e.kind]}){e.capabilities.length > 0 && ` · ${e.capabilities.map((t) => EQUIPMENT_TAG_LABEL[t]).join('، ')}`}
          </div>
        ))}
      </Section>

      <InfoBanner className="mt-3">برای تغییر اطلاعات پروفایل، توانمندی‌ها یا ظرفیت با پشتیبانی دیجیتال سرو تماس بگیرید.</InfoBanner>

      <LogoutButton className="mt-3" />
    </>
  )
}

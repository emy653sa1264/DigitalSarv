import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { Book, Plus } from 'lucide-react'
import { ErrorState, GradientBadge, InfoBanner, TotalsPanel } from '@/components/brand'
import { notify } from '@/components/ui/sonner'
import { fa, money } from '@/lib/format'
import { useCatalog } from '@/lib/query'
import { isDraftEmpty, useDraft } from '@/stores/draft'
import { CampaignBanner } from '../components/CampaignBanner'
import { Screen } from '../components/Screen'
import { ChildAvatar, CtaButton, RailCard, SquareRemoveButton, ToneTile } from '../components/parts'
import { useDraftQuote } from '../hooks/queries'
import { ADD_SERVICE_BUTTONS, SERVICE_META } from '../lib/constants'
import { serviceView } from '../lib/services'

export function FamilyScreen() {
  const navigate = useNavigate()
  const children = useDraft((s) => s.children)
  const services = useDraft((s) => s.services)
  const removeChild = useDraft((s) => s.removeChild)
  const removeService = useDraft((s) => s.removeService)
  const catalog = useCatalog()
  const quote = useDraftQuote()

  // A child created by «افزودن فرزند» but never saved (the user backed out of its editor) is dropped here,
  // together with its services. Not on editor unmount: its service tiles leave and come back to the editor.
  useEffect(() => {
    const { newChildIndex, removeChild: drop } = useDraft.getState()
    if (newChildIndex !== null) drop(newChildIndex)
  }, [])

  const books = children.reduce((sum, c) => sum + c.books, 0)
  const colorName = (key: string) => catalog.data?.colors.find((c) => c.key === key)?.name ?? ''

  return (
    <Screen title="سفارش خانوادگی" subtitle={`${fa(children.length)} فرزند · ${fa(books)} کتاب`} icon={Book} back="/app" addMore>
      <CampaignBanner className="mb-3.5" />
      <InfoBanner>برای هر فرزند فقط پایه تحصیلی را انتخاب کنید — کتاب‌های همان پایه خودکار محاسبه می‌شود.</InfoBanner>

      <div className="mt-3.5 flex flex-col gap-2.5">
        {children.map((c, i) => {
          const summary = [
            colorName(c.color),
            c.lined ? `${fa(c.linedCount || 10)} برگ خط‌دار` : '',
            c.extras.length ? `${fa(c.extras.length)} خدمت اضافی` : '',
          ]
            .filter(Boolean)
            .join(' · ')
          const total = quote.data?.children.find((x) => x.index === i)?.total
          return (
            <RailCard key={i} tone={c.tone} className="rounded-[22px] p-3.5">
              <div className="flex items-center gap-3">
                <ChildAvatar name={c.name} tone={c.tone} />
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-extrabold">{c.name || 'فرزند جدید'}</div>
                  <div className="mt-px text-xs text-muted-2">
                    {c.grade} · {fa(c.books)} کتاب
                  </div>
                </div>
                <SquareRemoveButton
                  label={`حذف ${c.name || 'فرزند'}`}
                  onClick={() => {
                    removeChild(i)
                    notify(`${c.name || 'فرزند'} از سفارش حذف شد`)
                  }}
                />
              </div>
              {summary && <div className="mt-[9px] text-[11.5px] text-muted-2">{summary}</div>}
              <div className="mt-[11px] flex items-center justify-between border-t border-line-soft pt-[11px]">
                <span className="text-[13px] font-bold text-muted-1">{total !== undefined ? money(total) : '…'}</span>
                <button
                  type="button"
                  onClick={() => navigate(`/app/child/${i}`)}
                  className="cursor-pointer rounded-full bg-blue-soft px-4 py-[9px] text-[13px] font-extrabold text-blue-dark hover:bg-[#d3e0fb]"
                >
                  پایه و گزینه‌ها
                </button>
              </div>
            </RailCard>
          )
        })}
      </div>
      <button
        type="button"
        onClick={() => navigate('/app/child/new')}
        className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[22px] border-[1.5px] border-dashed border-[#b9c6e6] bg-white p-4 text-[15px] font-extrabold text-blue-dark hover:bg-blue-soft"
      >
        <Plus className="size-[19px]" strokeWidth={3} />
        افزودن فرزند
      </button>

      <div className="mt-[22px] mb-1 text-base font-black">سرویس‌های دیگر در همین سفارش</div>
      <div className="mb-2.5 text-xs text-muted-2">یک تحویل‌گیری، یک تحویل — چاپ اسناد و بقیه سرویس‌ها هم اینجا جمع می‌شوند.</div>
      <div className="flex flex-col gap-[9px]">
        {services.map((s, i) => {
          const v = serviceView(s, i, quote.data)
          return (
            <RailCard key={i} tone={v.meta.tone} className="flex items-center gap-[11px]">
              <GradientBadge tone={v.meta.tone} size={38}>
                <v.meta.icon className="size-[19px]" strokeWidth={2.3} />
              </GradientBadge>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-extrabold">{v.label}</div>
                <div className="mt-0.5 text-[11.5px] text-muted-2">{v.detail}</div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className="text-[12.5px] font-bold whitespace-nowrap">{v.price}</span>
                <button
                  type="button"
                  onClick={() => {
                    removeService(i)
                    notify(`${v.label} حذف شد`)
                  }}
                  className="cursor-pointer text-[11.5px] font-bold text-pink-dark"
                >
                  حذف
                </button>
              </div>
            </RailCard>
          )
        })}
      </div>
      <div className="mt-[11px] grid grid-cols-2 gap-[9px]">
        {ADD_SERVICE_BUTTONS.map((b) => {
          const meta = SERVICE_META[b.kind]
          return (
            <ToneTile
              key={b.kind}
              tone={meta.tone}
              onClick={() => navigate(meta.path)}
              className="flex items-center gap-[9px] rounded-[18px] px-3.5 py-3 text-[13px] font-extrabold odd:last:col-span-2"
            >
              <GradientBadge tone={meta.tone} size={30}>
                <meta.icon className="size-4" strokeWidth={2.4} />
              </GradientBadge>
              افزودن {b.label}
            </ToneTile>
          )
        })}
      </div>

      {quote.isError && !quote.data ? (
        <ErrorState className="mt-[18px]" error={quote.error} onRetry={() => void quote.refetch()} />
      ) : (
        <TotalsPanel
          className="mt-[18px]"
          meta={`${fa(children.length)} فرزند · ${fa(books)} کتاب`}
          metaEnd="جمع سفارش"
          label="قبل از تحویل‌گیری و تخفیف"
          amount={quote.data ? money(quote.data.subtotal) : '…'}
        />
      )}
      <CtaButton
        className="mt-3"
        onClick={() => {
          if (isDraftEmpty({ children, services })) notify('ابتدا یک فرزند یا سرویس اضافه کنید')
          else navigate('/app/summary')
        }}
      >
        بستن سفارش و مشاهده خلاصه
      </CtaButton>
    </Screen>
  )
}

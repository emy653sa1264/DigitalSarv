import { useNavigate } from 'react-router'
import { Crown, Medal } from 'lucide-react'
import { ErrorState, InfoBanner, LoadingBlock } from '@/components/brand'
import { notify } from '@/components/ui/sonner'
import { fa, money } from '@/lib/format'
import { useCatalog } from '@/lib/query'
import type { Plan } from '@/lib/types'
import { useAuth } from '@/stores/auth'
import { useDraft } from '@/stores/draft'
import { Screen } from '../components/Screen'
import { CtaButton } from '../components/parts'
import { useDraftQuote, useSetPlan } from '../hooks/queries'

export function MembershipScreen() {
  const navigate = useNavigate()
  const userPlan = useAuth((s) => s.user?.planId)
  const draftPlan = useDraft((s) => s.planId)
  const setDraftPlan = useDraft((s) => s.setPlan)
  const catalog = useCatalog()
  const quote = useDraftQuote()
  const setPlan = useSetPlan()

  const current = draftPlan ?? userPlan ?? quote.data?.planId
  const currentPlan = catalog.data?.plans.find((p) => p.id === current)

  const pick = (p: Plan) => {
    const previous = draftPlan
    setDraftPlan(p.id)
    setPlan.mutate(p.id, {
      onSuccess: () => notify(`پلن ${p.title} فعال شد`),
      onError: () => setDraftPlan(previous),
    })
  }

  const loading = catalog.isPending || (quote.isPending && !quote.data)
  const error = catalog.error ?? (quote.data ? null : quote.error)

  return (
    <Screen title="عضویت" subtitle="قبل از پرداخت، پلن را مقایسه کنید" icon={Crown} tone="amber" back="/app/pickup" addMore>
      <InfoBanner tone="amber" className="p-[15px] font-semibold">
        قبل از پرداخت، اثر هر پلن روی همین سفارش را ببینید و انتخاب کنید. پلن فعال: {currentPlan ? `${currentPlan.title} (${currentPlan.name})` : '—'}
      </InfoBanner>

      {loading ? (
        <LoadingBlock rows={4} className="mt-3.5" />
      ) : error ? (
        <ErrorState
          className="mt-3.5"
          error={error}
          onRetry={() => {
            void catalog.refetch()
            void quote.refetch()
          }}
        />
      ) : (
        <div className="mt-3.5 flex flex-col gap-2.5">
          {catalog.data?.plans.map((p) => {
            const on = p.id === current
            const total = quote.data?.plansCompare.find((x) => x.planId === p.id)?.total
            const saving = quote.data && total !== undefined ? quote.data.total - total : 0
            const savingText =
              saving > 0 ? `صرفه‌جویی ${money(saving)} نسبت به پلن فعلی` : saving < 0 ? 'گران‌تر از پلن فعلی' : 'پلن فعلی شما'
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                disabled={setPlan.isPending}
                onClick={() => pick(p)}
                className="block w-full cursor-pointer rounded-[22px] p-[15px] text-start disabled:cursor-wait"
                style={{ background: p.soft, color: p.ink, border: on ? `2.5px solid ${p.grad[1]}` : `1.5px solid ${p.border}` }}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-xl text-white"
                    style={{
                      background: `linear-gradient(160deg, ${p.grad[0]} 0%, ${p.grad[1]} 55%, ${p.grad[2]} 100%)`,
                      boxShadow: `0 6px 14px ${p.grad[2]}59, inset 0 1.5px 0 rgba(255,255,255,0.6)`,
                    }}
                  >
                    <Medal className="size-[18px]" strokeWidth={2.3} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-black">{p.title}</span>
                    <span className="block text-[11.5px] font-bold opacity-75">پلن {p.name}</span>
                  </span>
                  <span className="rounded-full px-3 py-[5px] text-[11.5px] font-extrabold text-white" style={{ background: p.grad[1] }}>
                    {on ? 'فعال' : 'انتخاب'}
                  </span>
                </span>
                <span className="mt-2 block text-[12.5px] font-bold opacity-80">{fa(p.price)} تومان در ماه</span>
                <span className="mt-1.5 block text-[12.5px] leading-[1.7] opacity-90">{p.perks}</span>
                <span className="mt-2 block text-[12.5px] font-bold">
                  این سفارش با {p.title}: {total !== undefined ? money(total) : '…'}
                </span>
                <span className="mt-1.5 block text-xs font-extrabold" style={{ color: saving > 0 ? '#14764a' : p.ink }}>
                  {savingText}
                </span>
              </button>
            )
          })}
        </div>
      )}
      <CtaButton className="mt-3.5" onClick={() => navigate('/app/pay')}>
        ادامه به پرداخت
      </CtaButton>
    </Screen>
  )
}

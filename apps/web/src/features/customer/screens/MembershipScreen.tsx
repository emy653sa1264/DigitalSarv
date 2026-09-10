import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Crown, Medal } from 'lucide-react'
import { ErrorState, InfoBanner, LoadingBlock } from '@/components/brand'
import { notify } from '@/components/ui/sonner'
import { fa, money } from '@/lib/format'
import { useCatalog } from '@/lib/query'
import type { Plan, PlanId } from '@/lib/types'
import { useAuth } from '@/stores/auth'
import { isDraftEmpty, useDraft } from '@/stores/draft'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Screen } from '../components/Screen'
import { CtaButton } from '../components/parts'
import { useDraftQuote, useSetPlan } from '../hooks/queries'

/**
 * Two modes:
 * - checkout (the draft has items): picking a plan only sets `draft.planId`; `POST /orders` activates it.
 * - profile (empty draft): no per-order totals; activating is an explicit, confirmed `POST /users/me/plan`.
 */
export function MembershipScreen() {
  const navigate = useNavigate()
  const userPlan = useAuth((s) => s.user?.planId)
  const draftPlan = useDraft((s) => s.planId)
  const setDraftPlan = useDraft((s) => s.setPlan)
  const checkout = useDraft((s) => !isDraftEmpty(s))
  const catalog = useCatalog()
  const quote = useDraftQuote()
  const setPlan = useSetPlan()
  const [chosen, setChosen] = useState<PlanId | undefined>(undefined)
  const [confirming, setConfirming] = useState(false)

  const plans = catalog.data?.plans ?? []
  const current = checkout ? (draftPlan ?? userPlan ?? quote.data?.planId) : (chosen ?? userPlan)
  const activePlan = plans.find((p) => p.id === (checkout ? current : userPlan))
  const chosenPlan = plans.find((p) => p.id === current)

  const pick = (p: Plan) => {
    if (!checkout) return setChosen(p.id)
    setDraftPlan(p.id)
    notify(`پلن ${p.title} برای این سفارش انتخاب شد`)
  }

  const activate = () => {
    if (!chosenPlan) return
    setPlan.mutate(chosenPlan.id, {
      onSuccess: () => {
        setChosen(undefined)
        notify(`پلن ${chosenPlan.title} فعال شد`)
      },
    })
  }

  const loading = catalog.isPending || (checkout && quote.isPending && !quote.data)
  const error = catalog.error ?? (checkout && !quote.data ? quote.error : null)

  return (
    <Screen
      title="عضویت"
      subtitle={checkout ? 'قبل از پرداخت، پلن را مقایسه کنید' : 'مقایسه و فعال‌سازی پلن'}
      icon={Crown}
      tone="amber"
      back={checkout ? '/app/pickup' : '/app/me'}
      addMore={checkout}
    >
      <InfoBanner tone="amber" className="p-[15px] font-semibold">
        {checkout
          ? 'قبل از پرداخت، اثر هر پلن روی همین سفارش را ببینید و انتخاب کنید؛ پلن انتخاب‌شده با ثبت همین سفارش فعال می‌شود.'
          : 'پلن دلخواه را انتخاب و فعال کنید؛ تخفیف آن روی سفارش‌های بعدی شما اعمال می‌شود.'}{' '}
        پلن {checkout ? 'این سفارش' : 'فعال'}: {activePlan ? `${activePlan.title} (${activePlan.name})` : '—'}
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
          {plans.map((p) => {
            const on = p.id === current
            const total = quote.data?.plansCompare.find((x) => x.planId === p.id)?.total
            const saving = quote.data && total !== undefined ? quote.data.total - total : 0
            const savingText =
              saving > 0 ? `صرفه‌جویی ${money(saving)} نسبت به پلن فعلی` : saving < 0 ? 'گران‌تر از پلن فعلی' : 'پلن فعلی شما'
            const tag = checkout ? (on ? 'فعال' : 'انتخاب') : p.id === userPlan ? 'فعال' : on ? 'انتخاب‌شده' : 'انتخاب'
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
                    {tag}
                  </span>
                </span>
                <span className="mt-2 block text-[12.5px] font-bold opacity-80">{fa(p.price)} تومان در ماه</span>
                <span className="mt-1.5 block text-[12.5px] leading-[1.7] opacity-90">{p.perks}</span>
                {checkout && (
                  <>
                    <span className="mt-2 block text-[12.5px] font-bold">
                      این سفارش با {p.title}: {total !== undefined ? money(total) : '…'}
                    </span>
                    <span className="mt-1.5 block text-xs font-extrabold" style={{ color: saving > 0 ? '#14764a' : p.ink }}>
                      {savingText}
                    </span>
                  </>
                )}
              </button>
            )
          })}
        </div>
      )}

      {checkout ? (
        <CtaButton className="mt-3.5" onClick={() => navigate('/app/pay')}>
          ادامه به پرداخت
        </CtaButton>
      ) : (
        <CtaButton
          className="mt-3.5"
          disabled={!chosenPlan || chosenPlan.id === userPlan || setPlan.isPending}
          onClick={() => setConfirming(true)}
        >
          {setPlan.isPending
            ? 'در حال فعال‌سازی…'
            : !chosenPlan || chosenPlan.id === userPlan
              ? 'پلن فعلی شما'
              : `فعال‌سازی پلن ${chosenPlan.title}`}
        </CtaButton>
      )}

      {chosenPlan && (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={`فعال‌سازی پلن ${chosenPlan.title}؟`}
          description={`حق عضویت ${money(chosenPlan.price)} در ماه است و از این پس تخفیف و مزایای پلن ${chosenPlan.title} روی سفارش‌های شما اعمال می‌شود.`}
          confirmLabel="فعال‌سازی"
          onConfirm={activate}
        />
      )}
    </Screen>
  )
}

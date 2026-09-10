import { Medal } from 'lucide-react'
import { EmptyState, ErrorState } from '@/components/brand'
import { Skeleton } from '@/components/ui/skeleton'
import { fa } from '@/lib/format'
import { useCatalog } from '@/lib/query'
import type { Plan } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAuth } from '@/stores/auth'
import { FAQ } from './content'

/**
 * "عضویت" — intro + plan cards + FAQ. On large screens intro and FAQ share the first column and the
 * plans fill the second (prototype); on phones the order is intro → plans → FAQ.
 */
export function MembershipSection({ showPlans, showFaq }: { showPlans: boolean; showFaq: boolean }) {
  const { data: catalog, isPending, isError, error, refetch } = useCatalog()
  const user = useAuth((s) => s.user)
  const selected = user?.role === 'customer' ? user.planId : null

  if (!showPlans && !showFaq) return null
  const plans = catalog?.plans ?? []
  const active = plans.find((p) => p.id === selected)

  return (
    <section
      id={showPlans ? 'plans' : undefined}
      className="grid scroll-mt-24 gap-[22px] pt-2.5 pb-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:grid-rows-[auto_1fr]"
    >
      {showPlans && (
        <div className="lg:col-start-1 lg:row-start-1">
          <h2 className="mt-0 mb-2 text-[26px] sm:text-[28px]">عضویت</h2>
          <p className="m-0 text-[15px] leading-[1.8] text-muted-1">
            پلن‌ها را مقایسه کنید؛ با زدن هر پلن، در اپ اثر آن را روی سفارش خود می‌بینید و فعالش می‌کنید.
            {active && (
              <>
                {' '}
                پلن فعال:{' '}
                <strong>
                  {active.title} ({active.name})
                </strong>
              </>
            )}
          </p>
        </div>
      )}

      {showPlans && (
        <div className="grid grid-cols-1 gap-3.5 self-start sm:grid-cols-2 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          {isPending ? (
            Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[210px] rounded-[24px] bg-white/80" />)
          ) : isError ? (
            <ErrorState error={error} onRetry={() => void refetch()} className="sm:col-span-2" />
          ) : plans.length === 0 ? (
            <EmptyState title="پلنی تعریف نشده است" className="sm:col-span-2" />
          ) : (
            plans.map((p) => <PlanCard key={p.id} plan={p} on={p.id === selected} />)
          )}
        </div>
      )}

      {showFaq && (
        <div className="self-start rounded-[24px] border border-line bg-white p-[18px] lg:col-start-1 lg:row-start-2">
          <h3 className="mt-0 mb-2 text-[15px] font-extrabold tracking-normal">پرسش‌های پرتکرار</h3>
          {FAQ.map((f) => (
            <div key={f.q} className="border-t border-line-soft py-[11px]">
              <div className="text-sm font-bold">{f.q}</div>
              <div className="mt-[3px] text-[13px] leading-[1.7] text-muted-1">{f.a}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** Cross-app link: the customer app's «عضویت» screen compares and activates the plan. */
function PlanCard({ plan: p, on }: { plan: Plan; on: boolean }) {
  const badge = on ? 'پلن فعال' : p.id === 'gold' ? 'پیشنهاد ما' : null
  return (
    <a
      href="/app/membership"
      className="block w-full cursor-pointer rounded-[24px] p-5 text-start no-underline transition-transform hover:-translate-y-0.5"
      style={{ background: p.soft, color: p.ink, border: on ? `2.5px solid ${p.grad[1]}` : `1.5px solid ${p.border}` }}
    >
      <span className="flex items-center gap-[11px]">
        <span
          className="flex size-[38px] shrink-0 items-center justify-center rounded-[13px] text-white"
          style={{
            background: `linear-gradient(160deg, ${p.grad[0]} 0%, ${p.grad[1]} 55%, ${p.grad[2]} 100%)`,
            boxShadow: `0 7px 15px ${p.grad[2]}59, inset 0 1.5px 0 rgba(255,255,255,0.6)`,
          }}
        >
          <Medal className="size-[19px]" strokeWidth={2.3} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-black">{p.title}</span>
          <span className="mt-px block text-xs font-bold opacity-75">پلن {p.name}</span>
        </span>
        {badge && (
          <span
            className={cn('shrink-0 rounded-full px-[11px] py-[5px] text-[11.5px] font-extrabold text-white')}
            style={{ background: p.grad[1] }}
          >
            {badge}
          </span>
        )}
      </span>
      <span className="mt-3.5 mb-0.5 block text-[22px] font-black">{fa(p.price)}</span>
      <span className="block text-xs opacity-75">تومان در ماه</span>
      <span className="mt-3 block text-[13px] leading-[1.9]">{fa(p.perks)}</span>
    </a>
  )
}

import { useLocation, useNavigate } from 'react-router'
import { ChevronLeft, Crown } from 'lucide-react'
import { GradientBadge } from '@/components/brand'
import { notify } from '@/components/ui/sonner'
import { fa } from '@/lib/format'
import { useCatalog } from '@/lib/query'
import { cn } from '@/lib/utils'
import { useDraft } from '@/stores/draft'

/** Active campaign banner (home + order screen): tapping applies its coupon and opens the order screen. */
export function CampaignBanner({ className }: { className?: string }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const campaign = useCatalog().data?.campaign
  const coupon = useDraft((s) => s.coupon)
  const setCoupon = useDraft((s) => s.setCoupon)
  if (!campaign) return null

  const on = coupon?.toLowerCase() === campaign.code.toLowerCase()
  const apply = () => {
    if (!on) {
      setCoupon(campaign.code)
      notify(`کد ${campaign.title} فعال شد — ${fa(campaign.couponPct)}٪ تخفیف`)
    }
    if (pathname !== '/app/family') navigate('/app/family')
  }

  return (
    <button
      type="button"
      onClick={apply}
      className={cn(
        'relative flex w-full cursor-pointer items-center gap-3 overflow-hidden rounded-[24px] bg-violet-dark p-4 text-start text-white hover:bg-[#3d2699]',
        className,
      )}
    >
      <span className="pointer-events-none absolute -end-5 -top-[30px] size-[120px] rounded-full bg-[rgba(124,92,245,0.6)]" />
      <GradientBadge tone="amber" size={44} className="relative" style={{ boxShadow: '0 8px 18px rgba(7,9,15,0.3), inset 0 1.5px 0 rgba(255,255,255,0.55)' }}>
        <Crown className="size-[22px]" strokeWidth={2.4} />
      </GradientBadge>
      <span className="relative min-w-0 flex-1">
        <span className="block text-[15px] font-extrabold">{campaign.title}</span>
        <span className="mt-0.5 block text-[12.5px] text-[#d5cbff]">
          {on
            ? `کد ${campaign.code} فعال است · ${fa(campaign.couponPct)}٪ تخفیف روی این سفارش`
            : campaign.bannerNote || `${fa(campaign.couponPct)}٪ تخفیف با کد ${campaign.code} — برای فعال‌سازی بزنید`}
        </span>
      </span>
      <ChevronLeft className="relative size-[18px] shrink-0 text-[#d5cbff]" strokeWidth={2.6} />
    </button>
  )
}

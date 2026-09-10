import { ErrorState, TONES } from '@/components/brand'
import { Skeleton } from '@/components/ui/skeleton'
import { money } from '@/lib/format'
import { useCatalog } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { PRICE_ITEMS, START_ORDER } from './content'
import type { AnchorLink } from './Hero'

/** Optional "قیمت‌ها" strip (CMS key `prices`, off by default) — base unit prices straight from the catalog. */
export function PricesSection() {
  const { data: catalog, isPending, isError, error, refetch } = useCatalog()
  return (
    <section id="prices" className="scroll-mt-24 pt-2.5 pb-8">
      <h2 className="mt-0 mb-1.5 text-[26px] sm:text-[28px]">قیمت‌ها</h2>
      <p className="mt-0 mb-[18px] text-[15px] text-muted-1">تعرفه پایه خدمات؛ مبلغ نهایی هر سفارش پیش از پرداخت محاسبه و نمایش داده می‌شود.</p>
      {isPending ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {PRICE_ITEMS.map((i) => (
            <Skeleton key={i.key} className="h-[92px] rounded-[20px] bg-white/80" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {PRICE_ITEMS.map((item) => (
            <div key={item.key} className="rounded-[20px] p-4" style={{ background: TONES[item.tone].soft, color: TONES[item.tone].ink }}>
              <div className="text-[11.5px] font-bold opacity-70">{item.group}</div>
              <div className="mt-0.5 text-[12.5px] opacity-85">{item.label}</div>
              <div className="mt-1.5 text-lg font-black sm:text-xl">{money(catalog.prices[item.key])}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export function CtaBand() {
  return (
    <div className="relative mb-[34px] flex flex-wrap items-center justify-between gap-6 overflow-hidden rounded-[30px] bg-night p-6 sm:p-10">
      <div className="pointer-events-none absolute end-[-40px] -bottom-[70px] size-[220px] rounded-full bg-[rgba(47,109,246,0.35)]" />
      <div className="relative">
        <h2 className="mt-0 mb-2 text-[24px] text-white sm:text-[30px]">امشب سفارش دهید، پس‌فردا کتاب‌ها آماده.</h2>
        <p className="m-0 text-[15px] text-[#9aa2b8] sm:text-base">۲۴ تا ۴۸ ساعت برای یک خانواده کامل — بدون یک قدم بیرون رفتن.</p>
      </div>
      <Button
        asChild
        className="relative h-auto w-full px-[34px] py-[18px] text-[17px] shadow-[0_12px_26px_rgba(47,109,246,0.5)] sm:w-auto"
      >
        <a href={START_ORDER}>ثبت سفارش کتاب‌ها</a>
      </Button>
    </div>
  )
}

export function LandingFooter({ links }: { links: AnchorLink[] }) {
  return (
    <footer className="flex flex-wrap justify-between gap-5 border-t border-line pt-[22px] pb-5 text-[13px] text-muted-1">
      <div>دیجیتال سرو — پلتفرم خدمات چاپ و فنری با تحویل درب منزل</div>
      {links.length > 0 && (
        <nav className="flex gap-[18px]" aria-label="پیوندهای پایین صفحه">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-blue-dark hover:text-blue">
              {l.label}
            </a>
          ))}
        </nav>
      )}
    </footer>
  )
}

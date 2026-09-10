import { ChevronLeft } from 'lucide-react'
import { GradientBadge, TreeIcon } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { fa } from '@/lib/format'
import { useCatalog } from '@/lib/query'
import type { Campaign } from '@/lib/types'
import { HERO_STATS, START_ORDER } from './content'

export interface AnchorLink {
  href: string
  label: string
}

/** Dark pill navigation (prototype order: links + CTA at the start, brand block at the end). */
export function LandingNav({ links }: { links: AnchorLink[] }) {
  return (
    <header className="mt-[22px] flex items-center justify-between gap-3 rounded-full bg-night py-2.5 ps-3 pe-3 sm:pe-[22px]">
      <div className="flex items-center gap-6 text-sm font-bold">
        {links.length > 0 && (
          <nav className="hidden items-center gap-6 md:flex" aria-label="بخش‌های صفحه">
            {links.map((l) => (
              <a key={l.href} href={l.href} className="text-[#c6cbdc] transition-colors hover:text-white">
                {l.label}
              </a>
            ))}
          </nav>
        )}
        <Button asChild className="h-auto px-[22px] py-3 text-sm shadow-[0_6px_16px_rgba(47,109,246,0.45)]">
          <a href={START_ORDER}>ثبت سفارش</a>
        </Button>
      </div>
      <a href="/" className="flex items-center gap-[11px]" aria-label="دیجیتال سرو">
        <div className="text-end">
          <div className="text-[15px] font-black text-white sm:text-[17px]">دیجیتال سرو</div>
          <div className="hidden text-[11.5px] text-[#7b839a] sm:block">چاپ، فنری و تحویل درب منزل</div>
        </div>
        <GradientBadge tone="green" size={42}>
          <TreeIcon size={23} />
        </GradientBadge>
      </a>
    </header>
  )
}

function campaignLine(c: Campaign) {
  const title = c.title.startsWith('کمپین') ? c.title : `کمپین ${c.title}`
  return c.couponPct > 0 ? `${fa(title)} فعال است — ${fa(c.couponPct)}٪ تخفیف` : `${fa(title)} فعال است`
}

export function HeroSection({ showCampaign }: { showCampaign: boolean }) {
  const { data: catalog } = useCatalog()
  const campaign = showCampaign ? catalog?.campaign : null

  return (
    <section className="grid items-center gap-[30px] pt-9 pb-[34px] md:pt-[46px] lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <div>
        {campaign && (
          <div className="mb-[18px] inline-flex items-center gap-2 rounded-full bg-violet-soft px-4 py-[7px] text-[13px] font-extrabold text-violet-dark">
            <span className="size-[9px] shrink-0 rounded-full bg-violet shadow-[0_0_0_4px_rgba(124,92,245,0.22)]" />
            {campaignLine(campaign)}
          </div>
        )}
        <h1 className="m-0 text-[clamp(34px,5vw,62px)] leading-[1.14] text-pretty">
          اول مهر، بچه‌ها
          <br />
          <span className="text-blue">با کتاب‌های نو</span>
        </h1>
        <p className="mt-[18px] mb-0 max-w-[520px] text-base leading-[1.75] text-pretty text-muted-1 sm:text-lg">
          پایه تحصیلی را انتخاب نمایید، سفارش را ثبت کنید و بقیه کار را به ما بسپارید — پیک می‌آید، کتاب‌ها را می‌برد، فنری و آماده می‌کند و
          درب منزل برمی‌گرداند.
        </p>
        <div className="mt-[26px] flex flex-wrap gap-3">
          <Button asChild className="h-auto grow px-7 py-[17px] text-base shadow-[0_10px_24px_rgba(47,109,246,0.4)] sm:grow-0">
            <a href={START_ORDER}>
              ثبت سفارش کتاب‌های مدرسه
              <ChevronLeft strokeWidth={2.7} />
            </a>
          </Button>
          <Button asChild variant="outline" className="h-auto grow px-7 py-[17px] text-base sm:grow-0">
            <a href="/app/docs">چاپ اسناد و مدارک</a>
          </Button>
        </div>
        <div className="mt-9 grid grid-cols-3 gap-2.5 sm:flex sm:flex-wrap">
          {HERO_STATS.map((s) => (
            <div key={s.label} className={`rounded-[20px] px-3.5 py-3.5 sm:px-5 ${s.tile}`}>
              <div className={`text-[20px] font-black sm:text-[26px] ${s.valueClass}`}>{s.value}</div>
              <div className={`text-xs sm:text-[13px] ${s.labelClass}`}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
      <HeroArt />
    </section>
  )
}

/**
 * Owner-supplied hero illustration (design/v2/assets/hero-source.png): a family in Shiraz receiving
 * spiral-bound school books from a Digital Sarv courier. Shown uncropped (3:2); it is the LCP image,
 * preloaded from index.html.
 */
function HeroArt() {
  return (
    <figure className="m-0 overflow-hidden rounded-[30px] bg-blue-soft shadow-[0_24px_60px_rgba(27,69,184,0.16)]">
      <picture>
        <source
          type="image/webp"
          srcSet="/images/hero-640.webp 640w, /images/hero-1024.webp 1024w, /images/hero-1536.webp 1536w"
          sizes="(min-width: 1024px) 600px, 100vw"
        />
        <img
          src="/images/hero-1536.jpg"
          width={1536}
          height={1024}
          alt="خانواده‌ای در شیراز کتاب‌های فنری‌شده مدرسه را درب منزل از پیک دیجیتال سرو تحویل می‌گیرند"
          fetchPriority="high"
          decoding="async"
          className="block aspect-[3/2] h-auto w-full object-cover"
        />
      </picture>
    </figure>
  )
}

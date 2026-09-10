import { BookOpen } from 'lucide-react'
import { GradientBadge, TONES } from '@/components/brand'
import { Button } from '@/components/ui/button'
import type { ShowSection } from './api'
import { SERVICE_CARDS, START_ORDER, type ServiceCard } from './content'

export function ServicesSection({ show }: { show: ShowSection }) {
  const cards = SERVICE_CARDS.filter((c) => show(c.key))
  const school = show('school')
  if (!school && cards.length === 0) return null

  return (
    <>
      <div id="services" className="scroll-mt-24 pt-[26px] pb-2">
        <h2 className="mt-0 mb-1.5 text-[26px] sm:text-[32px]">یک اپ، تمام کارهای چاپی شما و فرزندانتان</h2>
        <p className="m-0 text-[15px] text-muted-1 sm:text-base">از فنری کتاب مدرسه تا شارژ کارتریج — یک سفارش، یک پیک، یک تحویل.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 pt-[22px] pb-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {school && <SchoolCard />}
        {cards.map((c) => (
          <BentoCard key={c.title} card={c} />
        ))}
      </div>
    </>
  )
}

function SchoolCard() {
  return (
    <div className="relative flex min-h-[256px] flex-col justify-between overflow-hidden rounded-[30px] bg-[#0d1a3d] p-6 sm:col-span-2 sm:p-8">
      <div className="pointer-events-none absolute -top-[50px] end-[-40px] size-[220px] rounded-full bg-[rgba(47,109,246,0.35)]" />
      <div className="relative">
        <GradientBadge tone="blue" size={54}>
          <BookOpen className="size-[27px]" strokeWidth={2.3} />
        </GradientBadge>
        <h3 className="mt-[18px] mb-2 text-[24px] text-white sm:text-[28px]">فنری کتاب‌های مدرسه</h3>
        <p className="m-0 max-w-[470px] text-[15px] leading-[1.7] text-[#a9b6d6] sm:text-base">
          پایه را بزنید، کتاب‌ها خودشان می‌آیند — از اول ابتدایی تا سوم دبیرستان، با رنگ فنری و خدمات دلخواه هر فرزند.
        </p>
      </div>
      <Button asChild className="relative mt-[22px] h-auto self-start px-7 py-[15px] text-[15px] shadow-[0_10px_22px_rgba(47,109,246,0.45)]">
        <a href={START_ORDER}>شروع سفارش</a>
      </Button>
    </div>
  )
}

function BentoCard({ card }: { card: ServiceCard }) {
  const tone = TONES[card.tone]
  const Icon = card.icon
  return (
    <div
      className="flex min-h-[236px] flex-col justify-between rounded-[30px] p-[26px]"
      style={{ background: tone.soft, color: tone.ink }}
    >
      <div>
        <GradientBadge tone={card.tone} size={46}>
          <Icon className="size-6" strokeWidth={2.3} />
        </GradientBadge>
        <h3 className="mt-4 mb-1.5 text-[21px]">{card.title}</h3>
        <p className="m-0 text-sm leading-[1.7] opacity-85">{card.body}</p>
      </div>
      <a
        href={card.to}
        className="mt-[18px] self-start rounded-full px-6 py-[13px] text-sm font-extrabold text-white shadow-[0_8px_18px_rgba(7,9,15,0.16)] transition-[filter] hover:brightness-90"
        style={{ background: tone.base }}
      >
        {card.cta}
      </a>
    </div>
  )
}

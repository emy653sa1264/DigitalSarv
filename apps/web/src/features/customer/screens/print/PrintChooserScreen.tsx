import { FileText, Palette } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { GradientBadge } from '@/components/brand'
import { Screen } from '../../components/Screen'

/** `/app/print` (old «چاپ اسناد» links): pick black & white or colour; `?for=` / `?edit=` are passed through. */
export function PrintChooserScreen() {
  const [params] = useSearchParams()
  const q = params.toString() ? `?${params.toString()}` : ''
  const cards = [
    { to: `/app/print/bw${q}`, title: 'چاپ سیاه‌وسفید', sub: 'جزوه، مدرک اداری، برگه · A3 تا A6', icon: FileText, tone: 'cyan' as const },
    { to: `/app/print/color${q}`, title: 'چاپ رنگی', sub: 'متن رنگی، تمام‌رنگی، گلاسه و مقوا', icon: Palette, tone: 'violet' as const },
  ]
  return (
    <Screen title="چاپ" subtitle="نوع چاپ را انتخاب کنید" icon={FileText} tone="cyan" back="/app/family">
      <div className="flex flex-col gap-3">
        {cards.map((c) => (
          <Link key={c.to} to={c.to} className="flex items-center gap-3.5 rounded-[22px] bg-card p-4 shadow-card">
            <GradientBadge tone={c.tone} size={48}><c.icon className="size-[22px]" strokeWidth={2.4} /></GradientBadge>
            <span className="min-w-0">
              <span className="block text-[15px] font-extrabold text-ink">{c.title}</span>
              <span className="mt-0.5 block text-xs text-muted-2">{c.sub}</span>
            </span>
          </Link>
        ))}
      </div>
    </Screen>
  )
}

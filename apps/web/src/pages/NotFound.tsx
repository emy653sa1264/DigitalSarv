import { Logo } from '@/components/brand'
import { Button } from '@/components/ui/button'

/** Per-app 404. `homeHref` is the app's own root (or `/`); a full navigation, never a router link. */
export function NotFound({ homeHref = '/' }: { homeHref?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-shell px-6 text-center text-ink">
      <Logo size={64} />
      <h1 className="m-0 text-3xl">صفحه پیدا نشد</h1>
      <p className="m-0 text-muted-1">آدرسی که وارد کردید وجود ندارد.</p>
      <Button asChild size="lg">
        <a href={homeHref}>بازگشت به صفحه اصلی</a>
      </Button>
    </div>
  )
}

/** Temporary screen used by route stubs until a feature is implemented. */
export function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex min-h-[50dvh] items-center justify-center p-10 text-xl font-black text-muted-2">{title} — به‌زودی</div>
  )
}

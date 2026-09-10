import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react'
import { isRouteErrorResponse, useRouteError } from 'react-router'
import { Logo } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { NotFound } from '@/pages/NotFound'

/** Friendly full-page fallback after an unexpected render error. Uses plain links (it may render outside the router). */
export function ErrorFallback({ homeHref }: { homeHref: string }) {
  return (
    <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-shell px-6 text-center text-ink">
      <Logo size={64} />
      <h1 className="m-0 text-2xl">مشکلی پیش آمد</h1>
      <p className="m-0 max-w-[340px] text-[15px] leading-[1.8] text-muted-1">
        صفحه با خطای غیرمنتظره‌ای روبه‌رو شد. لطفاً دوباره بارگذاری کنید؛ اگر مشکل ادامه داشت کمی بعد دوباره سر بزنید.
      </p>
      <div className="mt-1 flex w-full max-w-[340px] flex-col gap-2.5">
        <Button size="lg" block onClick={() => window.location.reload()}>
          بارگذاری دوباره
        </Button>
        <Button asChild size="lg" variant="outline" block>
          <a href={homeHref}>بازگشت به صفحه اصلی</a>
        </Button>
      </div>
    </div>
  )
}

/** Route-level errors (loader/render errors caught by the router). */
export function RouteErrorFallback({ homeHref }: { homeHref: string }) {
  const error = useRouteError()
  useEffect(() => {
    console.error(error)
  }, [error])
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound homeHref={homeHref} />
  return <ErrorFallback homeHref={homeHref} />
}

interface BoundaryProps {
  homeHref: string
  children: ReactNode
}

/** Last-resort boundary around the whole app (providers, router, toaster). */
export class AppErrorBoundary extends Component<BoundaryProps, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    return this.state.hasError ? <ErrorFallback homeHref={this.props.homeHref} /> : this.props.children
  }
}

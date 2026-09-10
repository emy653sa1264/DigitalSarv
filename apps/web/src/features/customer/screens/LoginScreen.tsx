import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router'
import { Check, X } from 'lucide-react'
import { FieldLabel, GradientBadge, Panel, ScreenBody, TreeIcon } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { notify } from '@/components/ui/sonner'
import { fa, toEnDigits } from '@/lib/format'
import { useOtpLogin } from '@/lib/query'
import { cn } from '@/lib/utils'
import { useAuth } from '@/stores/auth'
import { TERMS, TERMS_UPDATED } from '../lib/constants'

const PHONE_RE = /^(?:\+98|0098|98|0)?9\d{9}$/

function safeTarget(from: unknown): string {
  return typeof from === 'string' && from.startsWith('/app') && !from.startsWith('/app/login') ? from : '/app'
}

export function LoginScreen() {
  const token = useAuth((s) => s.token)
  const user = useAuth((s) => s.user)
  const location = useLocation()
  const target = safeTarget((location.state as { from?: unknown } | null)?.from)
  const { requestCode, verifyCode } = useOtpLogin()

  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [termsOk, setTermsOk] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [openTerm, setOpenTerm] = useState(0)

  // Signed-in customers never see this screen; after verify this also performs the redirect.
  if (token && user?.role === 'customer') return <Navigate to={target} replace />

  const sendCode = (resend: boolean) => {
    if (!termsOk) {
      notify('برای ادامه، قوانین و مقررات را بپذیرید')
      return
    }
    if (!PHONE_RE.test(phone)) {
      notify('شماره موبایل معتبر نیست')
      return
    }
    requestCode.mutate(phone, {
      onSuccess: (res) => {
        setStep('code')
        const prefix = resend ? 'کد تأیید دوباره ارسال شد' : 'کد تأیید ارسال شد'
        if (res.devCode) {
          setCode(res.devCode)
          notify(`${prefix}: ${fa(res.devCode)}`)
        } else {
          notify(prefix)
        }
      },
    })
  }

  const onPhoneSubmit = (e: FormEvent) => {
    e.preventDefault()
    sendCode(false)
  }

  const onCodeSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (code.length !== 4) {
      notify('کد چهاررقمی را وارد کنید')
      return
    }
    verifyCode.mutate(
      { phone, code },
      {
        onSuccess: ({ user: signedIn }) => {
          if (signedIn.role !== 'customer') {
            notify('این شماره متعلق به حساب مشتری نیست')
            return
          }
          const first = signedIn.name.trim().split(/\s+/)[0]
          notify(first ? `خوش آمدید، ${first}` : 'خوش آمدید')
        },
      },
    )
  }

  return (
    <ScreenBody>
      <div className="pt-3 pb-1.5 text-center">
        <GradientBadge
          tone="green"
          size={78}
          className="mx-auto flex"
          style={{ boxShadow: '0 16px 30px rgba(31,169,104,0.4), inset 0 2px 0 rgba(255,255,255,0.55)' }}
        >
          <TreeIcon size={38} strokeWidth={2.1} />
        </GradientBadge>
        <div className="mt-4 text-[22px] font-black">دیجیتال سرو</div>
        <div className="mt-1.5 text-[13.5px] leading-[1.8] text-muted-1">
          پایه تحصیلی را انتخاب کنید،
          <br />
          بقیه کار را به ما بسپارید.
        </div>
      </div>

      {step === 'phone' ? (
        <form onSubmit={onPhoneSubmit}>
          <Panel className="mt-5">
            <FieldLabel htmlFor="login-phone">شماره موبایل</FieldLabel>
            <Input
              id="login-phone"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              value={fa(phone)}
              onChange={(e) => setPhone(toEnDigits(e.target.value).replace(/[^\d+]/g, ''))}
              placeholder="۰۹۱۲۳۴۵۶۷۸۹"
              className="bg-field text-center text-base font-bold"
            />
            <button
              type="button"
              role="checkbox"
              aria-checked={termsOk}
              onClick={() => setTermsOk((v) => !v)}
              className="flex w-full cursor-pointer items-center gap-2.5 pt-3.5 pb-1 text-start"
            >
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-lg border-2',
                  termsOk ? 'border-green bg-green' : 'border-[#c3cadd] bg-transparent',
                )}
              >
                <Check className="size-3.5 text-white" strokeWidth={3.2} />
              </span>
              <span className="flex-1 text-[12.5px] leading-[1.7] text-muted-1">قوانین و مقررات و سیاست حریم خصوصی را می‌پذیرم.</span>
            </button>
            <button
              type="button"
              onClick={() => setShowTerms(true)}
              className="cursor-pointer pt-0.5 text-[12.5px] font-extrabold text-blue-dark"
            >
              مطالعه قوانین و مقررات
            </button>
          </Panel>
          <Button type="submit" size="lg" block className="mt-3" disabled={requestCode.isPending}>
            ارسال کد تأیید
          </Button>
        </form>
      ) : (
        <form onSubmit={onCodeSubmit}>
          <Panel className="mt-5">
            <div className="text-[12.5px] leading-[1.7] text-muted-1">
              کد چهاررقمی ارسال‌شده به{' '}
              <span dir="ltr" className="inline-block font-extrabold">
                {fa(phone)}
              </span>{' '}
              را وارد کنید.
            </div>
            <Input
              aria-label="کد تأیید"
              inputMode="numeric"
              autoComplete="one-time-code"
              dir="ltr"
              value={fa(code)}
              onChange={(e) => setCode(toEnDigits(e.target.value).replace(/\D/g, '').slice(0, 4))}
              placeholder="۴۸۲۹"
              className="mt-3 h-[58px] bg-field text-center text-[22px] font-black tracking-[0.4em]"
            />
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" className="flex-1 text-[13px]" onClick={() => sendCode(true)} disabled={requestCode.isPending}>
                ارسال دوباره کد
              </Button>
              <Button variant="outline" className="flex-1 text-[13px]" onClick={() => setStep('phone')}>
                اصلاح شماره
              </Button>
            </div>
          </Panel>
          <Button type="submit" size="lg" block className="mt-3" disabled={verifyCode.isPending}>
            ورود به حساب
          </Button>
        </form>
      )}

      {showTerms && (
        <Panel className="mt-3.5">
          <div className="mb-1.5 flex items-center justify-between gap-2.5">
            <div className="text-base font-black">قوانین و مقررات</div>
            <button
              type="button"
              aria-label="بستن"
              onClick={() => setShowTerms(false)}
              className="flex size-8 cursor-pointer items-center justify-center rounded-[11px] border border-line bg-white hover:bg-line-soft"
            >
              <X className="size-[15px] text-muted-1" strokeWidth={2.6} />
            </button>
          </div>
          <div className="mb-1 text-[11.5px] text-muted-2">{TERMS_UPDATED} · روی هر بند بزنید تا باز شود</div>
          {TERMS.map((term, i) => {
            const open = openTerm === i
            return (
              <button
                key={term.t}
                type="button"
                aria-expanded={open}
                onClick={() => setOpenTerm(open ? -1 : i)}
                className="flex w-full cursor-pointer items-start gap-2.5 border-t border-line-soft py-[11px] text-start"
              >
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-[9px] text-[11.5px] font-extrabold',
                    open ? 'bg-blue text-white' : 'bg-blue-soft text-blue-dark',
                  )}
                >
                  {fa(i + 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-extrabold text-ink">{term.t}</span>
                  {open && <span className="mt-1.5 block text-[12.5px] leading-[1.85] text-muted-1">{term.b}</span>}
                </span>
                <span className="mt-1 shrink-0 text-[11px] font-extrabold text-muted-3">{open ? '−' : '+'}</span>
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => {
              setTermsOk(true)
              setShowTerms(false)
            }}
            className="mt-3 w-full cursor-pointer rounded-full bg-green p-[15px] text-[15px] font-extrabold text-white shadow-[0_8px_18px_rgba(31,169,104,0.35)] hover:bg-green-dark"
          >
            می‌پذیرم و ادامه می‌دهم
          </button>
        </Panel>
      )}
    </ScreenBody>
  )
}

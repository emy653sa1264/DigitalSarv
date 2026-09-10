import { useState } from 'react'
import { Navigate, useLocation } from 'react-router'
import { FieldLabel, GradientBadge, Panel, ScreenBody, TreeIcon } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { notify } from '@/components/ui/sonner'
import { fa, toEnDigits } from '@/lib/format'
import { useLogout, useOtpLogin } from '@/lib/query'
import { useAuth } from '@/stores/auth'
import { CourierFrame } from './CourierShell'

const digitsOnly = (value: string) => toEnDigits(value).replace(/\D/g, '')

export function CourierLogin() {
  const token = useAuth((s) => s.token)
  const role = useAuth((s) => s.user?.role)
  const location = useLocation()
  const { requestCode, verifyCode } = useOtpLogin()
  const logout = useLogout()
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [phone, setPhone] = useState(import.meta.env.DEV ? '09121111111' : '')
  const [code, setCode] = useState('')

  // Signed in as a courier (already, or right after verifying) → back to where the guard sent us from.
  if (token && role === 'courier') {
    const from = (location.state as { from?: string } | null)?.from
    const target = from && from.startsWith('/courier') && !from.startsWith('/courier/login') ? from : '/courier'
    return <Navigate to={target} replace />
  }

  const sendCode = async (again = false) => {
    if (digitsOnly(phone).length < 10) {
      notify('شماره موبایل را درست وارد کنید')
      return
    }
    try {
      const res = await requestCode.mutateAsync(toEnDigits(phone).trim())
      setStep('code')
      const base = again ? 'کد تأیید دوباره ارسال شد' : 'کد تأیید ارسال شد'
      if (res.devCode) {
        setCode(res.devCode)
        notify(`${base}: ${fa(res.devCode)}`)
      } else {
        notify(base)
      }
    } catch {
      // server message already toasted by the mutation cache
    }
  }

  const signIn = async () => {
    const otp = digitsOnly(code)
    if (otp.length !== 4) {
      notify('کد چهاررقمی را وارد کنید')
      return
    }
    try {
      const { user } = await verifyCode.mutateAsync({ phone: toEnDigits(phone).trim(), code: otp })
      if (user.role !== 'courier') {
        await logout()
        setStep('phone')
        setCode('')
        notify('این شماره به‌عنوان پیک ثبت نشده است')
        return
      }
      notify(`خوش آمدید، ${user.name}`)
    } catch {
      // server message already toasted by the mutation cache
    }
  }

  return (
    <CourierFrame safeBottom>
      <ScreenBody className="pt-3">
        <div className="pt-3 pb-1.5 text-center">
          <GradientBadge tone="green" size={78} className="mx-auto">
            <TreeIcon size={38} strokeWidth={2.1} />
          </GradientBadge>
          <div className="mt-4 text-[22px] font-black">دیجیتال سرو</div>
          <div className="mt-1.5 text-[13.5px] leading-[1.8] text-muted-1">
            اپ پیک — مسیر امروز، شمارش و تحویل
            <br />
            با شماره موبایل ثبت‌شده وارد شوید.
          </div>
        </div>

        {step === 'phone' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void sendCode()
            }}
          >
            <Panel className="mt-5">
              <FieldLabel htmlFor="courier-phone">شماره موبایل</FieldLabel>
              <Input
                id="courier-phone"
                dir="ltr"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="۰۹۱۲۱۱۱۱۱۱۱"
                className="bg-field text-center text-base font-bold"
              />
            </Panel>
            <Button type="submit" size="lg" block className="mt-3" disabled={requestCode.isPending}>
              {requestCode.isPending ? 'در حال ارسال…' : 'ارسال کد تأیید'}
            </Button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void signIn()
            }}
          >
            <Panel className="mt-5">
              <div className="text-[12.5px] leading-[1.7] text-muted-1">
                کد چهاررقمی ارسال‌شده به{' '}
                <span dir="ltr" className="inline-block font-extrabold">
                  {fa(phone)}
                </span>{' '}
                را وارد کنید.
              </div>
              <Input
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-label="کد تأیید"
                maxLength={4}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="۴۸۲۹"
                className="mt-3 h-14 bg-field text-center text-[22px] font-black tracking-[0.4em]"
              />
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" size="sm" className="h-10 flex-1" disabled={requestCode.isPending} onClick={() => void sendCode(true)}>
                  ارسال دوباره کد
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 flex-1 hover:bg-line-soft"
                  onClick={() => {
                    setStep('phone')
                    setCode('')
                  }}
                >
                  اصلاح شماره
                </Button>
              </div>
            </Panel>
            <Button type="submit" size="lg" block className="mt-3" disabled={verifyCode.isPending}>
              {verifyCode.isPending ? 'در حال ورود…' : 'ورود به حساب'}
            </Button>
          </form>
        )}
      </ScreenBody>
    </CourierFrame>
  )
}

import { useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { FieldLabel, GradientBadge, Panel, ScreenBody, TreeIcon, type BrandTone } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { notify } from '@/components/ui/sonner'
import { fa, toEnDigits } from '@/lib/format'
import { useLogout, useOtpLogin } from '@/lib/query'
import type { Role } from '@/lib/types'
import { useAuth } from '@/stores/auth'

const digitsOnly = (value: string) => toEnDigits(value).replace(/\D/g, '')

export interface OtpLoginProps {
  role: Role
  /** App root, e.g. `/courier`. */
  homePath: string
  loginPath: string
  tone: BrandTone
  devPhone: string
  inputId: string
  wrongRoleMessage: string
  subtitle: ReactNode
  /** Wraps the screen in the app's full-screen frame. */
  frame: (content: ReactNode) => ReactNode
}

/** Phone → OTP login of the role apps (courier «سرو پیک», provider «سرو مجری»); other roles are signed out again. */
export function OtpLogin({ role, homePath, loginPath, tone, devPhone, inputId, wrongRoleMessage, subtitle, frame }: OtpLoginProps) {
  const token = useAuth((s) => s.token)
  const userRole = useAuth((s) => s.user?.role)
  const location = useLocation()
  const { requestCode, verifyCode } = useOtpLogin()
  const logout = useLogout()
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [phone, setPhone] = useState(import.meta.env.DEV ? devPhone : '')
  const [code, setCode] = useState('')

  if (token && userRole === role) {
    const from = (location.state as { from?: string } | null)?.from
    const target = from && from.startsWith(homePath) && !from.startsWith(loginPath) ? from : homePath
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
      if (user.role !== role) {
        await logout()
        setStep('phone')
        setCode('')
        notify(wrongRoleMessage)
        return
      }
      notify(`خوش آمدید، ${user.name}`)
    } catch {
      // server message already toasted by the mutation cache
    }
  }

  return frame(
    <ScreenBody className="pt-3">
      <div className="pt-3 pb-1.5 text-center">
        <GradientBadge tone={tone} size={78} className="mx-auto">
          <TreeIcon size={38} strokeWidth={2.1} />
        </GradientBadge>
        <div className="mt-4 text-[22px] font-black">دیجیتال سرو</div>
        <div className="mt-1.5 text-[13.5px] leading-[1.8] text-muted-1">{subtitle}</div>
      </div>

      {step === 'phone' ? (
        <form onSubmit={(e) => { e.preventDefault(); void sendCode() }}>
          <Panel className="mt-5">
            <FieldLabel htmlFor={inputId}>شماره موبایل</FieldLabel>
            <Input id={inputId} dir="ltr" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="۰۹۱۲۱۱۱۱۱۱۱" className="bg-field text-center text-base font-bold" />
          </Panel>
          <Button type="submit" size="lg" block className="mt-3" disabled={requestCode.isPending}>
            {requestCode.isPending ? 'در حال ارسال…' : 'ارسال کد تأیید'}
          </Button>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void signIn() }}>
          <Panel className="mt-5">
            <div className="text-[12.5px] leading-[1.7] text-muted-1">
              کد چهاررقمی ارسال‌شده به{' '}
              <span dir="ltr" className="inline-block font-extrabold">{fa(phone)}</span>{' '}
              را وارد کنید.
            </div>
            <Input dir="ltr" inputMode="numeric" autoComplete="one-time-code" aria-label="کد تأیید" maxLength={4} value={code}
              onChange={(e) => setCode(e.target.value)} placeholder="۴۸۲۹" className="mt-3 h-14 bg-field text-center text-[22px] font-black tracking-[0.4em]" />
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" size="sm" className="h-10 flex-1" disabled={requestCode.isPending} onClick={() => void sendCode(true)}>
                ارسال دوباره کد
              </Button>
              <Button variant="outline" size="sm" className="h-10 flex-1 hover:bg-line-soft" onClick={() => { setStep('phone'); setCode('') }}>
                اصلاح شماره
              </Button>
            </div>
          </Panel>
          <Button type="submit" size="lg" block className="mt-3" disabled={verifyCode.isPending}>
            {verifyCode.isPending ? 'در حال ورود…' : 'ورود به حساب'}
          </Button>
        </form>
      )}
    </ScreenBody>,
  )
}

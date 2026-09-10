import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { ShieldCheck } from 'lucide-react'
import { FieldLabel, GradientBadge, InfoBanner } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { notify, toast } from '@/components/ui/sonner'
import { fa, toEnDigits } from '@/lib/format'
import { qk, queryClient, useOtpLogin } from '@/lib/query'
import { useAuth } from '@/stores/auth'
import { AdminSurface } from '../layout/AdminSurface'
import { AdminBrand } from '../layout/Sidebar'

const DENIED = 'دسترسی به پنل مدیریت فقط برای مدیران امکان‌پذیر است'

export function AdminLoginPage() {
  const { requestCode, verifyCode } = useOtpLogin()
  const token = useAuth((s) => s.token)
  const user = useAuth((s) => s.user)
  const logout = useAuth((s) => s.logout)
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  const target = from && from.startsWith('/admin') && !from.startsWith('/admin/login') ? from : '/admin'

  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  if (token && user?.role === 'admin') return <Navigate to={target} replace />

  const sendCode = (e?: FormEvent) => {
    e?.preventDefault()
    setError('')
    const normalized = toEnDigits(phone).replace(/\s/g, '')
    if (normalized.replace(/\D/g, '').length < 10) {
      setError('شماره موبایل معتبر نیست')
      return
    }
    requestCode.mutate(normalized, {
      onSuccess: (res) => {
        setStep('code')
        if (res.devCode) {
          setCode(res.devCode)
          notify(`کد ورود (محیط توسعه): ${fa(res.devCode)}`)
        } else {
          notify('کد تأیید ارسال شد')
        }
      },
    })
  }

  const verify = (e: FormEvent) => {
    e.preventDefault()
    setError('')
    verifyCode.mutate(
      { phone: toEnDigits(phone).replace(/\s/g, ''), code: toEnDigits(code).trim() },
      {
        onSuccess: ({ user: u }) => {
          if (u.role !== 'admin') {
            logout()
            queryClient.removeQueries({ queryKey: qk.me })
            setError(DENIED)
            toast.error(DENIED)
            setStep('phone')
            setCode('')
            return
          }
          notify(`خوش آمدید، ${u.name || 'مدیر'}`)
          navigate(target, { replace: true })
        },
      },
    )
  }

  return (
    <AdminSurface className="flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-5 flex justify-center">
          <div className="rounded-[22px] bg-night px-5 py-3">
            <AdminBrand />
          </div>
        </div>
        <div className="rounded-[30px] border border-line bg-white p-6 shadow-[0_24px_60px_rgba(76,49,184,0.12)] sm:p-7">
          <GradientBadge tone="violet" size={52}>
            <ShieldCheck className="size-7" strokeWidth={2.3} />
          </GradientBadge>
          <h1 className="mt-4 mb-1 text-2xl">ورود به پنل مدیریت</h1>
          <p className="m-0 mb-5 text-[13.5px] leading-7 text-muted-2">
            {step === 'phone' ? 'شماره موبایل مدیر را وارد کنید تا کد تأیید ارسال شود.' : `کد ۴ رقمی ارسال‌شده به ${fa(toEnDigits(phone))} را وارد کنید.`}
          </p>

          {step === 'phone' ? (
            <form onSubmit={sendCode} className="grid gap-4">
              <div>
                <FieldLabel htmlFor="admin-phone">شماره موبایل</FieldLabel>
                <Input
                  id="admin-phone"
                  dir="ltr"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="۰۹۱۲۰۰۰۰۰۰۰"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="text-center text-base font-bold tracking-wider"
                  autoFocus
                />
              </div>
              <Button type="submit" size="lg" block disabled={requestCode.isPending}>
                {requestCode.isPending ? 'در حال ارسال…' : 'دریافت کد تأیید'}
              </Button>
            </form>
          ) : (
            <form onSubmit={verify} className="grid gap-4">
              <div>
                <FieldLabel htmlFor="admin-code">کد تأیید</FieldLabel>
                <Input
                  id="admin-code"
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="––––"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="text-center text-xl font-black tracking-[0.5em]"
                  autoFocus
                />
              </div>
              <Button type="submit" size="lg" block disabled={verifyCode.isPending || !code}>
                {verifyCode.isPending ? 'در حال بررسی…' : 'ورود'}
              </Button>
              <div className="flex justify-between gap-3 text-[13px] font-bold">
                <button type="button" className="cursor-pointer text-accent-soft-ink hover:underline" onClick={() => { setStep('phone'); setCode('') }}>
                  تغییر شماره
                </button>
                <button type="button" className="cursor-pointer text-accent-soft-ink hover:underline disabled:opacity-50" disabled={requestCode.isPending} onClick={() => sendCode()}>
                  ارسال مجدد کد
                </button>
              </div>
            </form>
          )}

          {error && (
            <InfoBanner tone="pink" className="mt-4">
              {error}
            </InfoBanner>
          )}
        </div>
      </div>
    </AdminSurface>
  )
}

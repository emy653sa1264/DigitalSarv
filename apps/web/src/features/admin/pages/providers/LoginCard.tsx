import { useState } from 'react'
import { InfoBanner } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { notify, toast } from '@/components/ui/sonner'
import { fa, toEnDigits } from '@/lib/format'
import { useCan } from '@/lib/permissions'
import type { Provider } from '@/lib/types'
import { ConfirmDelete } from '../../components/controls'
import { Field } from '../../components/FormDialog'
import { useProviderMutations, useProviders } from '../../providers-api'

/** The provider's OTP login for «سرو مجری» (`/provider/`). Saved immediately (not with the dialog). */
export function LoginCard({ provider }: { provider: Provider }) {
  const fresh = useProviders().data?.find((p) => p.id === provider.id) ?? provider
  const { linkLogin, unlinkLogin } = useProviderMutations()
  const canManage = useCan('provider_manage')
  const [phone, setPhone] = useState(fresh.login?.phone ?? '')

  const save = () => {
    const p = toEnDigits(phone).trim()
    if (p.replace(/\D/g, '').length < 10) return toast.error('شماره موبایل را درست وارد کنید')
    linkLogin.mutate({ id: fresh.id, phone: p }, { onSuccess: () => notify('ورود مجری ذخیره شد') })
  }

  return (
    <div className="grid gap-3">
      <InfoBanner>مجری با این شماره و کد تأیید پیامکی وارد «سرو مجری» (نشانی ‎/provider/‎) می‌شود. اگر این شماره حساب مشتری داشته باشد، به حساب مجری تبدیل می‌شود و دیگر نمی‌تواند با آن سفارش بدهد.</InfoBanner>
      <div className="text-[13px] font-bold">
        {fresh.login ? <>ورود فعال: <span dir="ltr" className="inline-block">{fa(fresh.login.phone)}</span>{fresh.login.name && ` · ${fresh.login.name}`}</> : 'هنوز ورودی برای این مجری تعریف نشده است.'}
      </div>
      <Field label="شماره موبایل ورود">
        <Input dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="۰۹۱۲۲۲۲۲۲۲۲" className="text-center" disabled={!canManage} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={save} disabled={!canManage || linkLogin.isPending}>{fresh.login ? 'تغییر شماره ورود' : 'تعریف ورود'}</Button>
        {fresh.login && canManage && (
          <ConfirmDelete triggerLabel="حذف ورود" title="حذف ورود مجری؟" description="این شماره دوباره حساب مشتری عادی می‌شود و نشست‌های باز آن بسته می‌شود."
            onConfirm={() => unlinkLogin.mutate(fresh.id, { onSuccess: () => { setPhone(''); notify('ورود مجری حذف شد') } })} />
        )}
      </div>
    </div>
  )
}

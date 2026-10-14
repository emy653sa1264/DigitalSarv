import { OtpLogin } from '@/components/auth/OtpLogin'
import { ProviderFrame } from './ProviderShell'

export function ProviderLogin() {
  return (
    <OtpLogin
      role="provider"
      homePath="/provider"
      loginPath="/provider/login"
      tone="cyan"
      devPhone="09122222222"
      inputId="provider-phone"
      wrongRoleMessage="این شماره به‌عنوان مجری ثبت نشده است"
      subtitle={<>پنل مجری — قیمت‌ها و پروفایل شما<br />با شماره موبایل ثبت‌شده وارد شوید.</>}
      frame={(content) => <ProviderFrame safeBottom>{content}</ProviderFrame>}
    />
  )
}

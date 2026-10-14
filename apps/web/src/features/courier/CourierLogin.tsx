import { OtpLogin } from '@/components/auth/OtpLogin'
import { CourierFrame } from './CourierShell'

export function CourierLogin() {
  return (
    <OtpLogin
      role="courier"
      homePath="/courier"
      loginPath="/courier/login"
      tone="green"
      devPhone="09121111111"
      inputId="courier-phone"
      wrongRoleMessage="این شماره به‌عنوان پیک ثبت نشده است"
      subtitle={<>اپ پیک — مسیر امروز، شمارش و تحویل<br />با شماره موبایل ثبت‌شده وارد شوید.</>}
      frame={(content) => <CourierFrame safeBottom>{content}</CourierFrame>}
    />
  )
}

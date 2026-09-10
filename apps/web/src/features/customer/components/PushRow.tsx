import { useEffect, useState } from 'react'
import { notify, toast } from '@/components/ui/sonner'
import { disablePush, enablePush, readPushState, type PushState } from '../lib/push'

const pill = 'shrink-0 cursor-pointer rounded-full px-3.5 py-2 text-[12.5px] font-extrabold disabled:cursor-wait disabled:opacity-60'

/** Profile «اعلان‌های مرورگر» control: unsupported · blocked · off (فعال‌سازی) · on (غیرفعال‌سازی). */
export function PushRow() {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    readPushState()
      .then((s) => alive && setState(s))
      .catch(() => alive && setState('off'))
    return () => {
      alive = false
    }
  }, [])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'فعال‌سازی اعلان مرورگر انجام نشد')
    } finally {
      setBusy(false)
    }
  }

  const turnOn = () =>
    run(async () => {
      const result = await enablePush()
      if (result === 'on') {
        setState('on')
        notify('اعلان‌های مرورگر فعال شد')
      } else if (result === 'denied') {
        setState(Notification.permission === 'denied' ? 'denied' : 'off')
        notify('اجازه نمایش اعلان داده نشد')
      } else {
        notify('اعلان مرورگر فعلاً در دسترس نیست؛ اعلان‌ها در صندوق اعلان‌های برنامه نمایش داده می‌شوند')
      }
    })

  const turnOff = () =>
    run(async () => {
      await disablePush()
      setState('off')
      notify('اعلان‌های مرورگر غیرفعال شد')
    })

  return (
    <div className="flex w-full items-center justify-between gap-3 py-[11px]">
      <span className="shrink-0 text-[13.5px] text-muted-2">اعلان‌های مرورگر</span>
      {state === null ? (
        <span className="text-[13px] text-muted-3">…</span>
      ) : state === 'unsupported' ? (
        <span className="min-w-0 text-end text-[13px] font-bold text-muted-2">مرورگر شما پشتیبانی نمی‌کند</span>
      ) : state === 'denied' ? (
        <span className="min-w-0 text-end text-[12.5px] font-bold text-muted-2">در تنظیمات مرورگر مسدود است</span>
      ) : state === 'on' ? (
        <span className="flex items-center gap-2">
          <span className="text-[13.5px] font-bold text-green-dark">فعال</span>
          <button type="button" disabled={busy} onClick={() => void turnOff()} className={`${pill} bg-line-soft text-muted-1 hover:bg-pink-soft`}>
            غیرفعال‌سازی
          </button>
        </span>
      ) : (
        <button type="button" disabled={busy} onClick={() => void turnOn()} className={`${pill} bg-blue-soft text-blue-dark hover:bg-[#d3e0fb]`}>
          {busy ? 'در حال فعال‌سازی…' : 'فعال‌سازی'}
        </button>
      )}
    </div>
  )
}

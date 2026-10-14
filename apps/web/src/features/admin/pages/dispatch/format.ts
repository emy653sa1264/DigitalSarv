import { money } from '@/lib/format'
import { PROVIDER_STATUS } from '@/lib/provider-labels'
import type { ProviderStatus } from '@/lib/types'

/** The shared date+time helper — never duplicate it. */
export { when } from '@/lib/format'

const TEHRAN = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tehran', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})

/** ISO → the value of an `<input type="datetime-local">` in Tehran time (ASCII `YYYY-MM-DDTHH:mm`), whatever the browser zone. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p: Record<string, string> = {}
  for (const x of TEHRAN.formatToParts(d)) p[x.type] = x.value
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

/** A Tehran datetime-local value → ISO, or null when empty/invalid. Iran has no DST, so the fixed +03:30 offset is safe. */
export function toIso(local: string): string | null {
  if (!local) return null
  const d = new Date(`${local}:00+03:30`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Round-trip invariant: for any ISO `x` with zero seconds, `toIso(toLocalInput(x)) === x` (to the minute otherwise). */
export function roundTripsToMinute(iso: string): boolean {
  const back = toIso(toLocalInput(iso))
  return back !== null && Math.floor(new Date(iso).getTime() / 60000) === Math.floor(new Date(back).getTime() / 60000)
}

export interface DeliveryProviderOption { id: string; name: string; status: ProviderStatus; deliveryFee: number | null; zoneOk: boolean; reason?: string }

/** The server accepts only `active` delivery providers (Q25): others are listed, tagged and disabled. */
export function deliveryOptions(list: DeliveryProviderOption[]): { value: string; label: string; disabled?: boolean }[] {
  return list.map((d) => ({
    value: d.id,
    disabled: d.status !== 'active',
    label: `${d.name}${d.status !== 'active' ? ` · ${PROVIDER_STATUS[d.status].label}${d.reason ? ` — ${d.reason}` : ''}` : ''}${d.deliveryFee === null ? '' : ` · ${money(d.deliveryFee)}`}${d.zoneOk ? '' : ' · خارج از منطقه'}`,
  }))
}

/** Preferred id when active, else the first active provider, else ''. */
export function pickActive(list: DeliveryProviderOption[], ...preferred: (string | undefined)[]): string {
  for (const id of preferred) if (id && list.some((d) => d.id === id && d.status === 'active')) return id
  return list.find((d) => d.status === 'active')?.id ?? ''
}

/** The shared date+time helper — never duplicate it. */
export { when } from '@/lib/format'

/** ISO → the value of an `<input type="datetime-local">` (browser time zone). */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

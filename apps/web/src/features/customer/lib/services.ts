import { money } from '@/lib/format'
import type { Quote, ServiceDraft } from '@/lib/types'
import { SERVICE_META } from './constants'

/** Display data for a draft service row; label/detail/price come from the quote (`index` = its position in that quote). */
export function serviceView(service: ServiceDraft, index: number, quote?: Quote) {
  const priced = quote?.services.find((s) => s.index === index)
  const meta = SERVICE_META[service.kind]
  const price = !priced ? '…' : priced.price === 0 && service.kind === 'repair' ? 'پس از عیب‌یابی' : money(priced.price)
  return { meta, label: priced?.label || meta.label, detail: priced?.detail ?? '', price }
}

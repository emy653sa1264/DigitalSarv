import { fa, toEnDigits } from '@/lib/format'
import { useCatalog } from '@/lib/query'
import type { OpsSettings } from '@/lib/types'
import { DEFAULT_OPS } from '../lib/constants'

/** `catalog.ops` with the contract defaults underneath (catalog loading, or fields an older API lacks). */
export function useOps(): OpsSettings {
  const { data } = useCatalog()
  return { ...DEFAULT_OPS, ...data?.ops }
}

/** Support phone: ASCII for `tel:` links, Persian digits for display. */
export function useSupportPhone() {
  const tel = toEnDigits(useOps().supportPhone).replace(/[^\d+]/g, '') || DEFAULT_OPS.supportPhone
  return { tel, display: fa(tel) }
}

import { useSearchParams } from 'react-router'
import { notify } from '@/components/ui/sonner'
import type { ServiceDraft, ServiceKind } from '@/lib/types'
import { useDraft } from '@/stores/draft'
import { SERVICE_META } from '../lib/constants'
import { useReturnTo } from './nav'

export type SpecOf<K extends ServiceKind> = Extract<ServiceDraft, { kind: K }>['spec']

/**
 * Shared add/edit flow for the docs/flyer/cart/repair screens.
 * URL drives the mode so deep links and "back" stay correct:
 * `?edit=<serviceIndex>` edits in place (then returns to the summary),
 * `?for=<childIndex>` binds a new service to a child (then returns to that child).
 */
export function useServiceEditor<K extends ServiceKind>(kind: K) {
  const [params] = useSearchParams()
  const services = useDraft((s) => s.services)
  const children = useDraft((s) => s.children)
  const addService = useDraft((s) => s.addService)
  const updateService = useDraft((s) => s.updateService)
  const returnTo = useReturnTo()

  const editRaw = params.get('edit')
  const forRaw = params.get('for')
  const editIndex = editRaw !== null && services[Number(editRaw)]?.kind === kind ? Number(editRaw) : null
  const existing = editIndex !== null ? services[editIndex] : undefined
  const forChild = existing ? (existing.childIndex ?? undefined) : forRaw !== null && children[Number(forRaw)] ? Number(forRaw) : undefined

  const save = (spec: SpecOf<K>) => {
    const service = { kind, childIndex: forChild, spec } as ServiceDraft
    const { label } = SERVICE_META[kind]
    if (editIndex !== null) {
      updateService(editIndex, service)
      notify(`${label} ویرایش شد`)
      returnTo('/app/summary')
      return
    }
    addService(service)
    notify(label + (children.length ? ' به سفارش خانوادگی اضافه شد' : ' به سفارش شما اضافه شد'))
    returnTo(forChild !== undefined ? `/app/child/${forChild}` : '/app/family')
  }

  return {
    initialSpec: existing?.spec as SpecOf<K> | undefined,
    isEditing: editIndex !== null,
    childName: forChild !== undefined ? children[forChild]?.name || 'فرزند' : undefined,
    save,
  }
}

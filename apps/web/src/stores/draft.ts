import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ChildDraft, OrderDraft, PayMethod, Pickup, PlanId, ServiceDraft, Tone, Upload } from '@/lib/types'

/** Rotating avatar tones for new children (prototype `addChild`). */
export const CHILD_TONES: Tone[] = ['blue', 'violet', 'pink', 'amber', 'cyan', 'green']

export const DEFAULT_SLOT = '۱۶ تا ۱۸'

const emptyPickup = (): Pickup => ({ address: '', phone: '', date: '', slot: DEFAULT_SLOT })

interface DraftData {
  children: ChildDraft[]
  services: ServiceDraft[]
  planId?: PlanId
  coupon?: string
  urgent: boolean
  pickup: Pickup
  payMethod: PayMethod
  /** Child currently open in the editor. */
  activeChild: number | null
  /** Index of a child created by "افزودن فرزند" that hasn't been saved yet. */
  newChildIndex: number | null
  /** Metadata of files uploaded for this draft (specs only keep ids), so editors can show name/size again. */
  uploads: Record<string, Upload>
}

interface DraftActions {
  /** Appends a child and returns its index. */
  addChild: (child: ChildDraft) => number
  updateChild: (index: number, patch: Partial<ChildDraft>) => void
  /** Removes the child plus the services bound to it; later `childIndex` bindings shift down. */
  removeChild: (index: number) => void
  setActiveChild: (index: number | null) => void
  markChildSaved: () => void
  addService: (service: ServiceDraft) => number
  updateService: (index: number, service: ServiceDraft) => void
  removeService: (index: number) => void
  setPlan: (planId: PlanId | undefined) => void
  setCoupon: (coupon: string | undefined) => void
  setUrgent: (urgent: boolean) => void
  setPickup: (patch: Partial<Pickup>) => void
  setPayMethod: (payMethod: PayMethod) => void
  /** Cache an upload's metadata (name/size/pages) for the service editors. */
  rememberUpload: (upload: Upload) => void
  /** Replace the draft with one from the server (e.g. POST /orders/:id/reorder). */
  applyDraft: (draft: OrderDraft) => void
  reset: () => void
}

export type DraftState = DraftData & DraftActions

const initial = (): DraftData => ({
  children: [],
  services: [],
  planId: undefined,
  coupon: undefined,
  urgent: false,
  pickup: emptyPickup(),
  payMethod: 'gateway',
  activeChild: null,
  newChildIndex: null,
  uploads: {},
})

export const useDraft = create<DraftState>()(
  persist(
    (set, get) => ({
      ...initial(),

      addChild: (child) => {
        const index = get().children.length
        set((s) => ({ children: [...s.children, child], activeChild: index, newChildIndex: index }))
        return index
      },
      updateChild: (index, patch) =>
        set((s) => ({ children: s.children.map((c, i) => (i === index ? { ...c, ...patch } : c)) })),
      removeChild: (index) =>
        set((s) => ({
          children: s.children.filter((_, i) => i !== index),
          services: s.services
            .filter((svc) => svc.childIndex !== index)
            .map((svc) =>
              svc.childIndex !== undefined && svc.childIndex > index ? { ...svc, childIndex: svc.childIndex - 1 } : svc,
            ),
          activeChild: null,
          newChildIndex: null,
        })),
      setActiveChild: (activeChild) => set({ activeChild }),
      markChildSaved: () => set({ newChildIndex: null }),

      addService: (service) => {
        const index = get().services.length
        set((s) => ({ services: [...s.services, service] }))
        return index
      },
      updateService: (index, service) =>
        set((s) => ({ services: s.services.map((svc, i) => (i === index ? service : svc)) })),
      removeService: (index) => set((s) => ({ services: s.services.filter((_, i) => i !== index) })),

      setPlan: (planId) => set({ planId }),
      setCoupon: (coupon) => set({ coupon: coupon?.trim() || undefined }),
      setUrgent: (urgent) => set({ urgent }),
      setPickup: (patch) => set((s) => ({ pickup: { ...s.pickup, ...patch } })),
      setPayMethod: (payMethod) => set({ payMethod }),
      rememberUpload: (upload) => set((s) => ({ uploads: { ...s.uploads, [upload.id]: upload } })),

      applyDraft: (draft) =>
        set({
          ...initial(),
          children: draft.children ?? [],
          services: draft.services ?? [],
          planId: draft.planId,
          coupon: draft.coupon,
          urgent: !!draft.urgent,
          pickup: { ...emptyPickup(), ...draft.pickup },
          payMethod: draft.payMethod ?? 'gateway',
        }),
      reset: () => set(initial()),
    }),
    {
      name: 'sarv-draft',
      version: 1,
      partialize: (s): DraftData => ({
        children: s.children,
        services: s.services,
        planId: s.planId,
        coupon: s.coupon,
        urgent: s.urgent,
        pickup: s.pickup,
        payMethod: s.payMethod,
        activeChild: s.activeChild,
        newChildIndex: s.newChildIndex,
        uploads: s.uploads,
      }),
    },
  ),
)

/** The pricing-relevant part of the draft — what `POST /orders/quote` needs. */
export function selectQuoteInput(s: DraftData): OrderDraft {
  return { children: s.children, services: s.services, planId: s.planId, coupon: s.coupon, urgent: s.urgent }
}

/** Full order body for `POST /orders`. */
export function selectOrderDraft(s: DraftData): OrderDraft {
  return { ...selectQuoteInput(s), pickup: s.pickup, payMethod: s.payMethod }
}

export const isDraftEmpty = (s: Pick<DraftData, 'children' | 'services'>) => s.children.length === 0 && s.services.length === 0

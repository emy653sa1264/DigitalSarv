import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  BankAccountView, CompensationItem, LedgerEntryView, LedgerKind, Paged, ProviderBalanceRow, ProviderLedgerAdmin, WalletReport, WeeklyStatement,
} from '@/lib/types'

export interface EntriesParams { page: number; limit?: number; kind?: LedgerKind; from?: string; to?: string }
export interface PayoutBody { providerId: string; amount: number; paidAt: string; bankRef: string; note?: string; requestId: string }
export interface AdjustBody { providerId: string; amount: number; reason: string; orderCode?: string; requestId: string }
export interface CompensationBody { jobId: string; providerId: string; amount: number; reason: string }
export interface BankBody { providerId: string; sheba: string; holder: string; bankName?: string }

/** Admin ledger query keys — everything under `['admin', 'ledger']` so one invalidation refreshes every view. */
export const lk = {
  all: ['admin', 'ledger'] as const,
  balances: (page: number, q?: string) => ['admin', 'ledger', 'balances', page, q ?? ''] as const,
  provider: (id: string) => ['admin', 'ledger', 'provider', id] as const,
  entries: (id: string, p: EntriesParams) => ['admin', 'ledger', 'entries', id, p] as const,
  statement: (id: string, cutoff: string) => ['admin', 'ledger', 'statement', id, cutoff] as const,
  pending: (page: number) => ['admin', 'ledger', 'pending', page] as const,
  compensation: (page: number) => ['admin', 'ledger', 'compensation', page] as const,
  wallet: (from: string, to: string) => ['admin', 'ledger', 'wallet', from, to] as const,
}

export const useLedgerBalances = (page: number, q?: string) =>
  useQuery({ queryKey: lk.balances(page, q), placeholderData: keepPreviousData, queryFn: () => api.get<Paged<ProviderBalanceRow>>('/admin/ledger/balances', { page, limit: 20, q }) })
export const useProviderLedger = (id: string | undefined) =>
  useQuery({ queryKey: lk.provider(id ?? ''), enabled: !!id, queryFn: () => api.get<ProviderLedgerAdmin>(`/admin/ledger/providers/${id}`) })
export const useLedgerEntries = (id: string, p: EntriesParams) =>
  useQuery({ queryKey: lk.entries(id, p), placeholderData: keepPreviousData, queryFn: () => api.get<Paged<LedgerEntryView>>(`/admin/ledger/providers/${id}/entries`, { ...p, limit: p.limit ?? 10 }) })
export const useStatement = (id: string, cutoff: string) =>
  useQuery({ queryKey: lk.statement(id, cutoff), placeholderData: keepPreviousData, queryFn: () => api.get<WeeklyStatement>(`/admin/ledger/providers/${id}/statement`, { cutoff }) })
export const usePendingCredits = (page: number, enabled = true) =>
  useQuery({ queryKey: lk.pending(page), enabled, placeholderData: keepPreviousData, queryFn: () => api.get<Paged<LedgerEntryView>>('/admin/ledger/pending', { page, limit: 20 }) })
export const useCompensation = (page: number, enabled = true) =>
  useQuery({ queryKey: lk.compensation(page), enabled, placeholderData: keepPreviousData, queryFn: () => api.get<Paged<CompensationItem>>('/admin/ledger/compensation', { page, limit: 20 }) })
export const useWallet = (from: string, to: string, enabled = true) =>
  useQuery({ queryKey: lk.wallet(from, to), enabled, placeholderData: keepPreviousData, queryFn: () => api.get<WalletReport>('/admin/ledger/wallet', { from, to }) })

/** Every ledger write refreshes every ledger view (balances, statements, queues, the wallet report). */
export function useLedgerMutations() {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: lk.all })
  return {
    payout: useMutation({ mutationFn: (b: PayoutBody) => api.post<LedgerEntryView>('/admin/ledger/payouts', b), onSuccess: refresh }),
    voidPayout: useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post<LedgerEntryView>(`/admin/ledger/payouts/${id}/void`, { reason }), onSuccess: refresh }),
    adjust: useMutation({ mutationFn: (b: AdjustBody) => api.post<LedgerEntryView>('/admin/ledger/adjustments', b), onSuccess: refresh }),
    resolve: useMutation({ mutationFn: ({ id, amount, reason }: { id: string; amount: number; reason: string }) => api.post<LedgerEntryView>(`/admin/ledger/entries/${id}/resolve`, { amount, reason }), onSuccess: refresh }),
    compensate: useMutation({ mutationFn: (b: CompensationBody) => api.post<LedgerEntryView>('/admin/ledger/compensation', b), onSuccess: refresh }),
    bank: useMutation({ mutationFn: ({ providerId, ...b }: BankBody) => api.put<BankAccountView>(`/admin/ledger/providers/${providerId}/bank`, b), onSuccess: refresh }),
  }
}

/** «خروجی CSV» of «کیف پول دیجیتال سرو» (authenticated download). */
export async function downloadWalletCsv(from: string, to: string): Promise<void> {
  const { blob, filename } = await api.blob(`/admin/ledger/wallet/export?from=${from}&to=${to}`)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || `sarv-wallet-${from}-${to}.csv`
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

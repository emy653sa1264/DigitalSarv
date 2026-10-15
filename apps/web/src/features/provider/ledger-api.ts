import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Paged, ProviderLedgerLine, ProviderLedgerSelf } from '@/lib/types'

/** Under `['provider']` like the rest of «سرو مجری» (one invalidation refreshes the app). */
export const providerLedgerKeys = {
  summary: ['provider', 'ledger'] as const,
  entries: (page: number) => ['provider', 'ledger', 'entries', page] as const,
}
export const useProviderSettlement = () =>
  useQuery({ queryKey: providerLedgerKeys.summary, queryFn: () => api.get<ProviderLedgerSelf>('/provider/ledger') })
export const useProviderLedgerEntries = (page: number) =>
  useQuery({ queryKey: providerLedgerKeys.entries(page), placeholderData: keepPreviousData, queryFn: () => api.get<Paged<ProviderLedgerLine>>('/provider/ledger/entries', { page, limit: 20 }) })

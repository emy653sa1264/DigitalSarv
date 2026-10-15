import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryClient } from '@/lib/query'
import type { PriceComboService, ProviderPriceRow, ProviderPriceView, ProviderSelf } from '@/lib/types'

export type ProviderPriceService = PriceComboService
/** Provider query keys — everything under `['provider']` so one invalidation refreshes the app. */
export const providerKeys = {
  all: ['provider'] as const,
  me: ['provider', 'me'] as const,
  prices: (service: ProviderPriceService) => ['provider', 'prices', service] as const,
  history: (comboKey: string) => ['provider', 'history', comboKey] as const,
}
export interface SubmitPriceBody { comboKey: string; price: number; effectiveFrom?: string; reason: string }

export const useProviderMe = () => useQuery({ queryKey: providerKeys.me, queryFn: () => api.get<ProviderSelf>('/provider/me') })

export const useProviderPrices = (service: ProviderPriceService) =>
  useQuery({ queryKey: providerKeys.prices(service), queryFn: () => api.get<ProviderPriceRow[]>('/provider/prices', { service }) })

export const useProviderPriceHistory = (comboKey: string | null) =>
  useQuery({
    queryKey: providerKeys.history(comboKey ?? ''),
    enabled: !!comboKey,
    queryFn: () => api.get<ProviderPriceView[]>('/provider/prices/history', { comboKey: comboKey ?? '' }),
  })

export function useSubmitProviderPrice() {
  return useMutation({
    mutationFn: (body: SubmitPriceBody) => api.post<ProviderPriceView>('/provider/prices', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: providerKeys.all }),
    // a rejected submit usually means the row changed under us (e.g. a pending request now exists): show the fresh state
    onError: () => queryClient.invalidateQueries({ queryKey: providerKeys.all }),
  })
}

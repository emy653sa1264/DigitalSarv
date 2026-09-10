import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { CmsSection } from '@/lib/types'
import { DEFAULT_OFF, type CmsKey } from './content'

type PublicCmsSection = Pick<CmsSection, 'key' | 'label' | 'on' | 'order'>

export function usePublicCms() {
  return useQuery({
    queryKey: ['cms', 'public'],
    queryFn: () => api.get<PublicCmsSection[]>('/cms'),
    staleTime: 60_000,
    retry: 1,
  })
}

/**
 * `show(key)` for landing sections. Loaded → the CMS `on` flag (unknown keys stay visible);
 * loading → everything except the default-off sections; failed → everything.
 */
export function useSectionVisibility() {
  const { data, isPending, isError } = usePublicCms()
  return useCallback(
    (key: CmsKey) => {
      if (isError) return true
      if (isPending || !data) return !DEFAULT_OFF.includes(key)
      const section = data.find((s) => s.key === key)
      return section ? section.on : true
    },
    [data, isPending, isError],
  )
}

export type ShowSection = ReturnType<typeof useSectionVisibility>

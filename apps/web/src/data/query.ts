// Query keys and the one read hook every data module uses (step 4.4). Reads go through core/api-client
// only; server state lives in the query client and nowhere else (CS-STATE-HOMES).
import { useQuery, type QueryKey, type UseQueryResult } from '@tanstack/react-query'
import { api } from '../core/api-client'

export const queryKeys = {
  bootstrap: ['bootstrap'] as const,
  usage: (itemId: number) => ['usage', itemId] as const,
  shopping: ['shopping-list'] as const,
  meals: (from?: string, to?: string) => ['meal-plans', from ?? null, to ?? null] as const,
  recipes: ['recipes'] as const,
  recipeSuggestions: ['recipes', 'suggestions'] as const,
  waste: ['waste'] as const,
  stats: (range: string, categoryId?: number) => ['stats', range, categoryId ?? null] as const,
  preferences: ['preferences'] as const,
}

type Query = Record<string, string | number | boolean | null | undefined>

export function useApiQuery<T>(
  key: QueryKey,
  path: string,
  query?: Query,
  options?: { enabled?: boolean },
): UseQueryResult<T> {
  return useQuery<T>({
    queryKey: key,
    queryFn: ({ signal }) => api.get<T>(path, { query, signal }),
    enabled: options?.enabled,
  })
}

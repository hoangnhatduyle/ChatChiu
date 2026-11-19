// Feeds the navigation its numbers from the cached board data (no extra request): how many items are past
// their date, shown on the Stock link of the wide sidebar and spoken in its name.
import { expiryStatus } from '@chatchiu/domain'
import { useMemo, type ReactNode } from 'react'
import { useToday } from '../../core/use-today'
import { useBootstrapQuery } from '../../data/inventory'
import { NavCountsContext } from '../../shell/nav-counts'

export function NavCountsProvider({ children }: { children: ReactNode }) {
  const items = useBootstrapQuery().data?.items
  const today = useToday()
  const expired = useMemo(
    () =>
      items?.filter((item) => expiryStatus(item.expirationDate, today) === 'expired').length ?? 0,
    [items, today],
  )
  const value = useMemo(() => ({ expired }), [expired])
  return <NavCountsContext value={value}>{children}</NavCountsContext>
}

// Opens the quick-action panel for the item named in the URL (?item=<id>): the board, and later the
// stock list and search, only set the parameter. A side panel on the tablet, a bottom sheet on the
// phone (ResponsivePanel). Closing removes the parameter. Loaded as its own chunk.
import { daysLeft, expiryDescription, todayLocalDateString } from '@chatchiu/domain'
import { useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { useToast } from '../../core/toast-context'
import { useBootstrapQuery } from '../../data/inventory'
import { ResponsivePanel } from '../../ui/ResponsivePanel'
import { ItemPanel } from './ItemPanel'

const ITEM_PARAM = 'item'
const ID_PATTERN = /^-?\d+$/

function parseItemId(raw: string | null): number | null {
  return raw !== null && ID_PATTERN.test(raw) ? Number(raw) : null
}

export default function ItemPanelHost() {
  const [params, setParams] = useSearchParams()
  const id = parseItemId(params.get(ITEM_PARAM))
  const bootstrap = useBootstrapQuery().data
  const item = id === null ? undefined : bootstrap?.items.find((i) => i.id === id)

  const close = useCallback(
    () =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete(ITEM_PARAM)
          return next
        },
        { replace: true },
      ),
    [setParams],
  )

  // A link to an item that is not there (deleted on another device, a bad link) must not do nothing.
  // An item she just removed here was seen first: that is not an error.
  const toasts = useToast()
  const seenId = useRef<number | null>(null)
  const itemId = item?.id
  useEffect(() => {
    if (itemId !== undefined) seenId.current = itemId
  }, [itemId])
  const raw = params.get(ITEM_PARAM)
  const isMissing = raw !== null && bootstrap !== undefined && !item
  useEffect(() => {
    if (!isMissing) return
    if (seenId.current !== id) {
      toasts.show({ message: 'That item is no longer in your kitchen.', tone: 'error' })
    }
    close()
  }, [isMissing, id, close, toasts])

  // After Move to waste or Delete the row she opened is gone: focus the page title, not the page's end.
  const removed = useCallback(() => {
    close()
    setTimeout(() => document.querySelector<HTMLElement>('h1')?.focus(), 0)
  }, [close])

  if (!item) return null
  const where = bootstrap?.locations.find((l) => l.id === item.locationId)?.name
  const expiry = expiryDescription(daysLeft(item.expirationDate, todayLocalDateString()))
  return (
    <ResponsivePanel
      isOpen
      onOpenChange={(open) => {
        if (!open) close()
      }}
      title={item.name}
      eyebrow={[where, expiry].filter(Boolean).join(' · ')}
    >
      <ItemPanel key={item.id} item={item} onRemoved={removed} />
    </ResponsivePanel>
  )
}

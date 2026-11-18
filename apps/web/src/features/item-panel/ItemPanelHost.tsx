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

/** How long to wait for the panel to leave the page before giving up on returning focus. */
const FOCUS_RETURN_TIMEOUT_MS = 1000

/** A newer request (or a route change that unmounts the host) cancels an older one still waiting. */
let focusRequest = 0

/**
 * The panel unmounts with its URL parameter, which drops focus to the page: put it back on the row.
 * The page behind a modal cannot take focus while the modal is mounted, so wait until it is gone. Gives up
 * (no focus move) if another dialog stays open, if something else has taken focus meanwhile, or if the row
 * is gone.
 */
function focusOpener(id: number) {
  const request = ++focusRequest
  const started = performance.now()
  const tryFocus = () => {
    if (request !== focusRequest) return
    if (document.querySelector('[role="dialog"]')) {
      if (performance.now() - started < FOCUS_RETURN_TIMEOUT_MS) requestAnimationFrame(tryFocus)
      return
    }
    const active = document.activeElement
    if (active && active !== document.body) return // she or the app already moved focus
    // The row may be gone (removed, filtered out, scrolled out of a virtual list): the page title takes focus.
    const target =
      document.querySelector<HTMLElement>(`[data-open-item="${id}"]`) ??
      document.querySelector<HTMLElement>('h1')
    target?.focus()
  }
  requestAnimationFrame(tryFocus)
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

  // After Move to waste or Delete the row she opened is gone: closing returns focus to the page title (below).
  const removed = close

  // One place returns focus whenever the panel goes from open to closed: Escape, the scrim, Close, Back, a
  // removed item. The page behind a modal cannot take focus until the modal is gone (focusOpener waits).
  const openId = item?.id
  const previousOpenId = useRef<number | undefined>(undefined)
  useEffect(() => {
    const previous = previousOpenId.current
    previousOpenId.current = openId
    if (previous !== undefined && openId === undefined) focusOpener(previous)
  }, [openId])
  // The board unmounts this host as a whole when `?item` goes away: that is also a close.
  useEffect(
    () => () => {
      const open = previousOpenId.current
      if (open !== undefined) focusOpener(open)
    },
    [],
  )

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

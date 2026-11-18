// /stock/new and /stock/:id/edit (SPEC-IF-001). Reads the kitchen from the bootstrap, saves through the
// inventory write hooks (the row shows at once and the write may wait offline), and returns to where she
// came from with a toast (F-IF-16). `?location=<id>` pre-fills the location (the board's "+" on a column).
// An edit is diffed against the item as it was when she opened it, so a change made on another device
// meanwhile is never written back over; if the item is removed meanwhile, her form stays, with a notice.
import type { InventoryItem } from '@chatchiu/contracts'
import { todayLocalDateString } from '@chatchiu/domain'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { useToast } from '../../core/toast-context'
import { itemWrites, useBootstrapQuery } from '../../data/inventory'
import { isTempId, newTempId } from '../../data/resource'
import { useIsReachable } from '../../data/sync-status'
import { useWrite, type WriteHandle } from '../../data/write'
import { PageTitle } from '../../shell/PageTitle'
import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/EmptyState'
import { Skeleton } from '../../ui/Skeleton'
import { ItemForm } from './ItemForm'
import {
  createBody,
  formValuesFromItem,
  newFormValues,
  updatePatch,
  type FormValues,
} from './item-form-model'

const NOT_STARTED = 'That change could not start. Try again in a moment.'
// Negative ids are rows still being created (data/resource.ts); the page tells her to wait.
const ITEM_ID = /^-?\d+$/

export default function ItemFormPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const toasts = useToast()
  const reachable = useIsReachable()
  const query = useBootstrapQuery()
  const create = useWrite(itemWrites.create)
  const update = useWrite(itemWrites.update)
  const data = query.data
  const mode = id === undefined ? 'add' : 'edit'
  const today = todayLocalDateString()

  const itemId = id !== undefined && ITEM_ID.test(id) ? Number(id) : null
  const found = itemId === null ? undefined : data?.items.find((i) => i.id === itemId)
  // The last version seen, so a form being edited survives the item being removed elsewhere.
  const [lastSeen, setLastSeen] = useState<InventoryItem | null>(null)
  if (found && found !== lastSeen) setLastSeen(found)
  const item = found ?? (lastSeen && lastSeen.id === itemId ? lastSeen : undefined)
  const removed = found === undefined && item !== undefined

  /** Back to where she came from; a page opened directly (no history in the app) goes to the board. */
  const back = () => (location.key !== 'default' ? void navigate(-1) : void navigate('/'))

  /**
   * Says what is happening and then what happened: the row shows at once but the server may still refuse
   * it (the failure then appears as its own toast) or the device may be offline (it syncs later).
   */
  const announce = (handle: WriteHandle<unknown>, doing: string, done: string, offline: string) => {
    toasts.show({ message: reachable ? doing : offline })
    void handle.result.then((result) => {
      if (result.status === 'saved') {
        if (reachable) toasts.show({ message: done })
      } else if (result.status === 'failed' && result.blocked) {
        // Refused before it started (e.g. "still being saved"): there is no failed-write toast for it.
        toasts.show({
          message: result.error instanceof Error ? result.error.message : NOT_STARTED,
          tone: 'error',
        })
      }
    })
  }

  const title = <PageTitle>{mode === 'add' ? 'Add item' : 'Edit item'}</PageTitle>
  const frame = (children: React.ReactNode) => (
    <div className="px-4 pt-5 pb-24 md:px-6 md:pt-6">
      {title}
      <div className="mt-4">{children}</div>
    </div>
  )

  if (!data) {
    return frame(
      query.isError ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-base font-semibold">
            Couldn&apos;t load your kitchen. Check your connection and try again.
          </p>
          <Button variant="primary" onPress={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <div role="status" aria-label="Loading the form" className="flex max-w-2xl flex-col gap-4">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ),
    )
  }

  const names = data.items.map((i) => i.name)

  if (mode === 'add') {
    const wanted = Number(params.get('location'))
    const prefill = data.locations.some((l) => l.id === wanted) ? wanted : null
    const save = (values: FormValues) => {
      const body = createBody(values)
      announce(
        create({ tempId: newTempId(), body }),
        `Adding ${body.name}…`,
        `Added ${body.name}`,
        `${body.name} is saved on this device and will sync when you are online`,
      )
      back()
    }
    return frame(
      <ItemForm
        // A new form for a new pre-filled location (the "+" of another column).
        key={`new-${prefill ?? 'none'}`}
        mode="add"
        initial={newFormValues({ today, locationId: prefill })}
        categories={data.categories}
        locations={data.locations}
        existingNames={names}
        today={today}
        onSubmit={save}
        onCancel={back}
      />,
    )
  }

  if (!item) {
    return frame(
      <EmptyState icon="box" title="That item is no longer in your kitchen" align="start">
        It may have been removed on another device.
        <Link to="/" className="mt-3 block font-bold text-accent underline">
          Back to the kitchen
        </Link>
      </EmptyState>,
    )
  }
  if (isTempId(item.id)) {
    return frame(
      <EmptyState icon="box" title="Still being saved" align="start">
        You can edit {item.name} once it is saved.
        <Link to="/" className="mt-3 block font-bold text-accent underline">
          Back to the kitchen
        </Link>
      </EmptyState>,
    )
  }
  return frame(
    <EditItem
      key={item.id}
      item={item}
      removed={removed}
      names={names}
      today={today}
      categories={data.categories}
      locations={data.locations}
      onSave={(patch, baseline) => {
        if (Object.keys(patch).length === 0) {
          toasts.show({ message: 'Nothing changed' })
          back()
          return
        }
        const name = patch.name ?? baseline.name
        announce(
          update({ id: baseline.id, patch }),
          `Saving ${name}…`,
          `Saved ${name}`,
          `${name} is saved on this device and will sync when you are online`,
        )
        back()
      }}
      onRemovedSave={() =>
        toasts.show({
          message: 'This item was removed on another device, so your changes were not saved.',
          tone: 'error',
        })
      }
      onCancel={back}
    />,
  )
}

type EditItemProps = {
  item: InventoryItem
  removed: boolean
  names: readonly string[]
  today: string
  categories: React.ComponentProps<typeof ItemForm>['categories']
  locations: React.ComponentProps<typeof ItemForm>['locations']
  onSave: (patch: ReturnType<typeof updatePatch>, baseline: InventoryItem) => void
  onRemovedSave: () => void
  onCancel: () => void
}

/** The edit form, diffed against the item as it was when it opened. */
function EditItem({
  item,
  removed,
  names,
  today,
  categories,
  locations,
  onSave,
  onRemovedSave,
  onCancel,
}: EditItemProps) {
  const [baseline] = useState(item)
  return (
    <>
      {removed && (
        <p
          role="alert"
          className="mb-4 max-w-2xl rounded-control bg-status-soon-bg px-3 py-2 text-md font-semibold text-status-soon-fg"
        >
          This item was removed on another device. You can still read your changes here, but they
          cannot be saved.
        </p>
      )}
      <ItemForm
        mode="edit"
        initial={formValuesFromItem(baseline)}
        original={baseline}
        categories={categories}
        locations={locations}
        existingNames={names}
        today={today}
        onSubmit={(values) => {
          if (removed) {
            onRemovedSave()
            return false
          }
          onSave(updatePatch(values, baseline), baseline)
          return undefined
        }}
        onCancel={onCancel}
      />
    </>
  )
}

// Receipt scan (SPEC-RS-001, route /scan): photo -> shrink -> upload -> AI reads -> review -> one bulk add -> done.
// The steps and the moves between them are receipt-flow.ts; the rules for what review opens with and what is sent
// are review-model.ts. This file wires them to the data hooks (AR-NO-DIRECT-API) and renders the review chrome.
import { todayLocalDateString } from '@chatchiu/domain'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { receiptScan } from '../../data/ai'
import { bulkCreateScanned, useBootstrapQuery } from '../../data/inventory'
import { useIsReachable } from '../../data/sync-status'
import { uploadReceipt } from '../../data/uploads'
import { newRequestId } from '../../data/query-client'
import { startWrite, useWrite } from '../../data/write'
import { PageTitle } from '../../shell/PageTitle'
import { Button } from '../../ui/Button'
import { Segmented } from '../../ui/Segmented'
import { Skeleton } from '../../ui/Skeleton'
import { useMediaQuery } from '../inventory/use-media-query'
import { CaptureStep } from './CaptureStep'
import { compressImage, ImageError } from './imageCompress'
import { readLastLocation, rememberLocation } from './last-location'
import { nextPhase, type FlowEvent, type Phase } from './receipt-flow'
import { ReviewTable } from './ReviewTable'
import { ReviewWizard } from './ReviewWizard'
import {
  addProblems,
  buildReviewItems,
  patchItem,
  toBulkItems,
  type ItemPatch,
  type ReviewItem,
} from './review-model'
import { addMessage, scanMessage, UNEXPECTED_MESSAGE, uploadMessage } from './scan-errors'

type Mode = 'wizard' | 'table'
const MODES = [
  { id: 'wizard', label: 'One by one' },
  { id: 'table', label: 'Table' },
] as const satisfies ReadonlyArray<{ id: Mode; label: string }>
const STATUS: Partial<Record<Phase, (count: number) => string>> = {
  REVIEW: () => 'Check the items we found, then add them.',
  ADDING: (n) => `Adding ${n} ${n === 1 ? 'item' : 'items'}…`,
}
const WIDE = '(min-width: 768px)'

export default function ReceiptScanPage() {
  const bootstrap = useBootstrapQuery()
  const reachable = useIsReachable()
  const wide = useMediaQuery(WIDE)
  const upload = useWrite(uploadReceipt)
  const scan = useWrite(receiptScan)
  const client = useQueryClient()

  const [phase, setPhase] = useState<Phase>('CAPTURE')
  const phaseRef = useRef<Phase>('CAPTURE')
  const [receiptDate, setReceiptDate] = useState(() => todayLocalDateString())
  const [items, setItems] = useState<ReviewItem[]>([])
  const [index, setIndex] = useState(0)
  const [chosenMode, setMode] = useState<Mode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState(0)
  const mounted = useRef(true)
  /** The request key of the add in flight: the same items always go with the same key (see addSelected). */
  const attempt = useRef<{ fingerprint: string; requestId: string } | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // Moves focus to what the new step is about; the whole screen is swapped, so focus would otherwise be lost.
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const target =
      phase === 'REVIEW'
        ? document.getElementById(error ? 'scan-error' : 'review-heading')
        : phase === 'DONE'
          ? document.getElementById('done-heading')
          : phase === 'ERROR'
            ? document.getElementById('scan-error')
            : phase === 'ADDING'
              ? document.getElementById('adding-status')
              : phase === 'CAPTURE'
                ? document.querySelector<HTMLElement>('h1')
                : document.getElementById('scan-working')
    requestAnimationFrame(() => target?.focus())
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps -- `error` only picks the target; the move is per step

  /** Moves to the next step; a move the flow does not allow is refused (and ignored). */
  const go = (event: FlowEvent): boolean => {
    const next = nextPhase(phaseRef.current, event)
    if (!next) return false
    phaseRef.current = next
    setPhase(next)
    return true
  }
  const fail = (event: FlowEvent, message: string) => {
    setError(message)
    go(event)
  }

  const categories = bootstrap.data?.categories ?? []
  const locations = bootstrap.data?.locations ?? []
  const mode = chosenMode ?? (wide ? 'table' : 'wizard')

  const choose = async (file: File) => {
    if (!go('photo_chosen')) return
    setError(null)
    try {
      let photo: Blob
      try {
        photo = await compressImage(file)
      } catch (e) {
        return fail(
          'compress_failed',
          e instanceof ImageError ? e.message : "That photo couldn't be used. Try another.",
        )
      }
      go('compressed')
      const uploaded = await upload({ photo }).result
      if (uploaded.status !== 'saved') {
        return fail(
          'upload_failed',
          uploadMessage(uploaded.status === 'failed' ? uploaded.error : null),
        )
      }
      // She left while the photo was uploading: do not spend a monthly scan on a result nobody will see.
      if (!mounted.current) return
      go('uploaded')
      const read = await scan({ imagePath: uploaded.data.path }).result
      if (read.status !== 'saved') {
        return fail(
          'quota_busy_or_bad_image',
          scanMessage(read.status === 'failed' ? read.error : null),
        )
      }
      setItems(
        buildReviewItems(read.data.items, {
          purchaseDate: receiptDate,
          categories,
          defaultLocationId: readLastLocation(locations.map((l) => l.id)),
        }),
      )
      setIndex(0)
      go('items_read')
    } catch {
      // Something unexpected (e.g. a line the reader returned that cannot be shown): say so, never hang.
      fail(
        phaseRef.current === 'READING' ? 'quota_busy_or_bad_image' : 'upload_failed',
        UNEXPECTED_MESSAGE,
      )
    }
  }

  const addSelected = async () => {
    if (addProblems(items).length > 0 || !go('add_selected')) return
    setError(null)
    try {
      const body = { items: toBulkItems(items) }
      // The same items go with the same request key, so pressing Add again after an answer was lost cannot add
      // them twice (the server answers the repeat with the first result). Edited items get a new key.
      const fingerprint = JSON.stringify(body)
      if (attempt.current?.fingerprint !== fingerprint) {
        attempt.current = { fingerprint, requestId: newRequestId() }
      }
      const result = await startWrite(
        client,
        bulkCreateScanned,
        { body },
        { requestId: attempt.current.requestId },
      ).result
      if (result.status !== 'saved') {
        return fail('bulk_error', addMessage(result.status === 'failed' ? result.error : null))
      }
      attempt.current = null
      const firstLocation = body.items[0]?.locationId
      if (firstLocation) rememberLocation(firstLocation)
      if (!mounted.current) return
      setAdded(body.items.length)
      go('bulk_ok')
    } catch {
      fail(
        'bulk_error',
        `${UNEXPECTED_MESSAGE} Nothing was changed on your side that you need to undo.`,
      )
    }
  }

  const reset = () => {
    setItems([])
    setError(null)
    go('scan_another')
  }
  const change = (key: number, patch: ItemPatch) => setItems((all) => patchItem(all, key, patch))

  const frame = (children: React.ReactNode) => (
    <div className="px-4 pt-5 pb-8 md:px-6 md:pt-6">
      <PageTitle>Scan a receipt</PageTitle>
      {/* Always present, so each step's words are announced (a live region inserted already filled often is not). */}
      <p role="status" className="sr-only">
        {STATUS[phase]?.(items.filter((i) => i.included).length)}
      </p>
      <div className="mt-4">{children}</div>
    </div>
  )

  if (phase === 'DONE') {
    return frame(
      <div className="flex max-w-xl flex-col items-start gap-3">
        <h2
          id="done-heading"
          tabIndex={-1}
          className="text-xl font-extrabold text-ink outline-none"
        >{`${added} ${added === 1 ? 'item' : 'items'} added`}</h2>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/"
            className="inline-flex min-h-touch items-center rounded-pill bg-accent px-5 text-md font-semibold text-accent-ink"
          >
            View on board
          </Link>
          <Button variant="secondary" onPress={reset}>
            Scan another receipt
          </Button>
        </div>
      </div>,
    )
  }

  if (phase === 'REVIEW' || phase === 'ADDING') {
    const problems = addProblems(items)
    const count = items.filter((i) => i.included).length
    const lists = { categories, locations }
    return frame(
      <section aria-labelledby="review-heading" className="flex flex-col gap-4">
        <h2
          id="review-heading"
          tabIndex={-1}
          className="text-lg font-extrabold text-ink outline-none"
        >
          Check your items
        </h2>
        <Segmented label="Review mode" options={MODES} value={mode} onChange={setMode} />
        {mode === 'wizard' ? (
          <ReviewWizard
            items={items}
            index={index}
            onIndex={setIndex}
            lists={lists}
            onChange={change}
          />
        ) : (
          <ReviewTable items={items} lists={lists} onChange={change} />
        )}
        {error && (
          <p
            id="scan-error"
            tabIndex={-1}
            role="alert"
            className="text-md font-semibold text-error outline-none"
          >
            {error}
          </p>
        )}
        {problems.length > 0 && (
          <ul id="add-problems" className="text-md text-muted">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {phase === 'ADDING' && (
          <div
            role="progressbar"
            aria-label={`Adding ${count} ${count === 1 ? 'item' : 'items'}`}
            className="h-2 w-full max-w-md overflow-hidden rounded-pill bg-track"
          >
            <div className="h-full w-1/2 animate-pulse rounded-pill bg-accent" />
          </div>
        )}
        <Button
          variant="primary"
          size="lg"
          className="self-start"
          isDisabled={problems.length > 0 || phase === 'ADDING'}
          aria-describedby={problems.length > 0 ? 'add-problems' : undefined}
          onPress={() => void addSelected()}
        >
          {`Add ${count} ${count === 1 ? 'item' : 'items'}`}
        </Button>
      </section>,
    )
  }

  if (!bootstrap.data) {
    return frame(
      bootstrap.isError ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-base font-semibold">
            Couldn&apos;t load your categories and locations. Check your connection and try again.
          </p>
          <Button variant="primary" onPress={() => void bootstrap.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <Skeleton className="h-40 w-full max-w-xl" />
      ),
    )
  }

  return frame(
    <CaptureStep
      phase={phase}
      receiptDate={receiptDate}
      onDate={setReceiptDate}
      onFile={(file) => void choose(file)}
      error={error}
      onRetry={() => {
        setError(null)
        go('retry_or_new_photo')
      }}
      blockedReason={reachable ? null : "You're offline. Scanning a receipt needs a connection."}
    />,
  )
}

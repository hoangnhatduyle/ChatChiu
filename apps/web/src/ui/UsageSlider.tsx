// Usage bar (F-KB-04, F-QP-01), step 6.1 (NC-AP-BUDGET): the react-aria slider is about 8 KB gzipped,
// so it is not part of the initial JS. Until it has loaded (loading starts when the first row mounts)
// a row shows a static bar of the same height, so nothing shifts. If the chunk cannot be fetched the
// bar becomes a visible "Couldn't load. Tap to retry" button; one successful retry turns every row
// on the screen into a slider (ui/usage-slider-loader.ts is the shared store).
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { cx } from './cx'
import { Icon } from './Icon'
import {
  getLoadedUsageSlider,
  getUsageSliderFailures,
  loadUsageSlider,
  subscribeUsageSlider,
} from './usage-slider-loader'
import type { UsageSliderProps } from './usage-slider-shared'

export { KEYBOARD_COMMIT_DELAY_MS, type UsageSliderProps } from './usage-slider-shared'

/** After this many failed loads in a row a retry cannot help (a browser may cache a failed import): reload. */
const RELOAD_AFTER_FAILURES = 2

const noop = () => undefined

export function UsageSlider(props: UsageSliderProps) {
  const renderSlider = useSyncExternalStore(subscribeUsageSlider, getLoadedUsageSlider, () => null)
  const failures = useSyncExternalStore(subscribeUsageSlider, getUsageSliderFailures, () => 0)
  const [retrying, setRetrying] = useState(false)
  const [note, setNote] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const retryHadFocus = useRef(false)

  useEffect(() => {
    if (!getLoadedUsageSlider()) loadUsageSlider().catch(noop) // the store records the failure
  }, [])

  // After a retry the slider replaces the button that had focus: move focus to the slider.
  useLayoutEffect(() => {
    if (!renderSlider || !retryHadFocus.current) return
    retryHadFocus.current = false
    rootRef.current?.querySelector<HTMLElement>('input[type="range"]')?.focus()
  }, [renderSlider])

  const mustReload = failures >= RELOAD_AFTER_FAILURES
  const retry = () => {
    if (props.isDisabled || retrying) return
    if (mustReload) {
      window.location.reload()
      return
    }
    retryHadFocus.current = rootRef.current?.contains(document.activeElement) ?? false
    setRetrying(true)
    setNote('Loading the control')
    loadUsageSlider()
      .then(
        () => setNote(''),
        () => setNote("Still couldn't load the control"),
      )
      .finally(() => setRetrying(false))
  }

  const isBig = props.size === 'big'
  const failed = failures > 0 && !renderSlider
  const bar = (
    <span
      data-usage-static
      aria-hidden={failed ? undefined : 'true'}
      className={cx(
        'relative block h-touch w-full',
        props.isDisabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span
        className={cx(
          'absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-pill bg-track',
          isBig ? 'h-3' : 'h-2',
        )}
      >
        <span
          className={cx('block h-full rounded-pill', props.tone === 'low' ? 'bg-low' : 'bg-fill')}
          style={{ width: `${props.value}%` }}
        />
      </span>
    </span>
  )

  const visible = retrying
    ? 'Loading…'
    : mustReload
      ? "Couldn't load. Tap to reload"
      : "Couldn't load. Tap to retry"

  return (
    <div ref={rootRef} className={cx('relative', props.className)}>
      {renderSlider ? (
        renderSlider({ ...props, className: undefined })
      ) : failed ? (
        <button
          type="button"
          aria-label={`${visible}: ${props.label}`}
          aria-busy={retrying || undefined}
          aria-disabled={props.isDisabled || retrying || undefined}
          onClick={retry}
          className={cx(
            'flex h-touch w-full cursor-pointer items-center justify-center gap-1.5 rounded-pill',
            'border border-dashed border-hair text-sm font-semibold text-muted outline-offset-2',
            props.isDisabled && 'cursor-not-allowed opacity-50',
          )}
        >
          <Icon name="refresh" size={16} />
          {visible}
        </button>
      ) : (
        bar
      )}
      <span role="status" className="sr-only">
        {note}
      </span>
    </div>
  )
}

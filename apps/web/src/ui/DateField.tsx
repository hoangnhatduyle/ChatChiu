// Date field with a calendar popover and quick chips 3d · 1w · 2w · 1m · 3m · 6m · 1y (F-IF-06).
// Values in and out are ISO dates (YYYY-MM-DD); offsets come from @chatchiu/domain (month = 30 d,
// year = 365 d, CS-DAY-MATHS).
import { parseDate } from '@internationalized/date'
import { useState } from 'react'
import { addExpiryOffset, EXPIRY_CHIPS, expiryOffsetPhrase, parseLocalDate } from '@chatchiu/domain'
import {
  Button,
  Calendar,
  CalendarCell,
  CalendarGrid,
  DateInput,
  DatePicker,
  DateSegment,
  Dialog,
  Group,
  Heading,
  Label,
  Popover,
  type DateValue,
} from 'react-aria-components'
import { cx } from './cx'
import { InlineError, LABEL } from './Field'
import { Icon } from './Icon'

export type DateFieldProps = {
  label: string
  /** ISO date or null. */
  value: string | null
  onChange: (value: string | null) => void
  /** When set, quick chips pick a date this many days/weeks/months/years after it. */
  quickFrom?: string
  isInvalid?: boolean
  errorMessage?: string
  className?: string
}

/** ISO date to a calendar value. A malformed value (it should never pass the contracts) shows an
 * empty field rather than crashing the form. */
function toDate(iso: string | null): DateValue | null {
  if (!iso) return null
  try {
    return parseDate(iso)
  } catch {
    return null
  }
}

export function DateField({
  label,
  value,
  onChange,
  quickFrom,
  isInvalid,
  errorMessage,
  className,
}: DateFieldProps) {
  // The date the last quick chip set; the status line says it while it is still the value.
  const [quickPick, setQuickPick] = useState<string | null>(null)
  const pickedNow = quickPick !== null && quickPick === value ? quickPick : null
  const pickQuick = (iso: string) => {
    setQuickPick(iso)
    onChange(iso)
  }
  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <DatePicker
        value={toDate(value)}
        onChange={(next) => onChange(next ? next.toString() : null)}
        isInvalid={isInvalid}
        className="flex flex-col gap-1.5"
      >
        <Label className={LABEL}>{label}</Label>
        <Group
          className={cx(
            'flex min-h-touch items-center rounded-control border border-field-line bg-surface pl-3',
            'data-invalid:border-2 data-invalid:border-error',
          )}
        >
          <DateInput className="flex flex-1  text-base text-ink tabular">
            {(segment) => (
              <DateSegment
                segment={segment}
                className="min-w-6 rounded-[4px] px-0.5 py-2 text-center data-focused:bg-accent data-focused:text-accent-ink data-placeholder:text-muted"
              />
            )}
          </DateInput>
          <Button
            aria-label={`Open calendar for ${label}`}
            className="flex size-touch cursor-pointer items-center justify-center text-muted data-hovered:text-ink"
          >
            <Icon name="calendar" size={20} />
          </Button>
        </Group>
        <InlineError>{errorMessage}</InlineError>
        <Popover className="rounded-card border border-line bg-surface p-3 shadow-pop">
          <Dialog aria-label={`${label}: pick a date`} className="outline-none">
            <CalendarPanel />
          </Dialog>
        </Popover>
      </DatePicker>
      {quickFrom && (
        <div
          role="group"
          aria-label={`Quick expiry picks for ${label}`}
          className="flex flex-wrap gap-1.5"
        >
          {EXPIRY_CHIPS.map((chip) => (
            <Button
              key={chip.label}
              aria-label={`${chip.label}, ${expiryOffsetPhrase(chip.amount, chip.unit)}`}
              onPress={() => pickQuick(addExpiryOffset(quickFrom, chip.amount, chip.unit))}
              className={cx(
                'inline-flex min-h-touch min-w-touch cursor-pointer items-center justify-center rounded-pill',
                'border border-line bg-surface px-3 tabular text-md font-medium text-ink',
                'data-hovered:bg-hover data-pressed:bg-pressed',
              )}
            >
              {chip.label}
            </Button>
          ))}
        </div>
      )}
      {/* Mounted empty and filled after a pick, so screen readers announce the change. */}
      <p role="status" className="min-h-5 tabular text-sm text-muted">
        {pickedNow && `${label} ${longDate(pickedNow)}`}
      </p>
    </div>
  )
}

const LONG_DATE_PARTS = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/** "Sat 31 Jan 2026", the prototype's date style, without ICU-dependent commas. */
function longDate(iso: string): string {
  const parts = LONG_DATE_PARTS.formatToParts(parseLocalDate(iso))
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value
  return [get('weekday'), get('day'), get('month'), get('year')].join(' ')
}

function CalendarPanel() {
  const nav =
    'flex size-touch cursor-pointer items-center justify-center rounded-pill text-ink data-hovered:bg-hover'
  return (
    <Calendar className="w-fit">
      <header className="mb-2 flex items-center gap-1">
        <Button slot="previous" className={nav}>
          <Icon name="chevron-left" size={18} />
        </Button>
        <Heading className="flex-1 text-center text-base font-bold" />
        <Button slot="next" className={nav}>
          <Icon name="chevron-right" size={18} />
        </Button>
      </header>
      <CalendarGrid className="border-separate border-spacing-0.5">
        {(date) => (
          <CalendarCell
            date={date}
            className={cx(
              'flex size-touch cursor-pointer items-center justify-center rounded-pill tabular text-md text-ink',
              'data-hovered:bg-hover data-outside-month:invisible data-today:font-extrabold data-today:underline',
              'data-selected:bg-accent data-selected:font-bold data-selected:text-accent-ink',
              'data-unavailable:text-disabled-ink',
            )}
          />
        )}
      </CalendarGrid>
    </Calendar>
  )
}

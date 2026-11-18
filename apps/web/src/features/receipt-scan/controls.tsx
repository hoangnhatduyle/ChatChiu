// Small native controls shared by the two review layouts. Native selects and date inputs keep the route
// light (the react-aria DateField and Select cost 40+ KB each, roadmap 5.6 lessons) and work well on a phone.
import { UNITS } from '@chatchiu/domain'
import type { ReactNode } from 'react'
import { LABEL } from '../../ui/Field'
import { cx } from '../../ui/cx'
import { NATIVE } from './field-values'

export function LabelledSelect({
  label,
  value,
  onChange,
  children,
  className,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cx('flex flex-col gap-1.5', className)}>
      <span className={LABEL}>{label}</span>
      <select className={NATIVE} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </label>
  )
}

export function LabelledDate({
  label,
  value,
  onChange,
  className,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <label className={cx('flex flex-col gap-1.5', className)}>
      <span className={LABEL}>{label}</span>
      <input
        type="date"
        className={NATIVE}
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
      />
    </label>
  )
}

/** The unit options: our list, plus whatever the item holds now so it is never silently changed. */
export function UnitOptions({ current }: { current: string }) {
  const units: readonly string[] = (UNITS as readonly string[]).includes(current)
    ? UNITS
    : [current, ...UNITS]
  return units.map((u) => (
    <option key={u} value={u}>
      {u}
    </option>
  ))
}

export function CategoryOptions({
  categories,
}: {
  categories: ReadonlyArray<{ id: number; name: string }>
}) {
  return (
    <>
      <option value="">Choose…</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </>
  )
}

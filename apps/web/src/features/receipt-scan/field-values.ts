// Class and parsing helpers for the review controls.
import { CONTROL } from '../../ui/Field'
import { cx } from '../../ui/cx'

export const NATIVE = cx(CONTROL, 'px-2')

export const idOf = (value: string): number | null => (value === '' ? null : Number(value))
/** A positive number typed by hand, or null (commas count as decimal points). */
export function parseNumber(text: string): number | null {
  const n = Number(text.trim().replace(',', '.'))
  return text.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null
}

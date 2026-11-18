// The board's header chips: their labels (F-KB-12). The order and the filtering live in the domain.
import { BOARD_CHIPS, type BoardChip } from '@chatchiu/domain'

export const CHIP_LABELS: Record<BoardChip, string> = {
  all: 'All',
  'use-soon': 'Use soon',
  'running-low': 'Running low',
  'used-up': 'Used up',
}

export const CHIP_ORDER: readonly BoardChip[] = BOARD_CHIPS

/** The chip named by ?show=, or All for anything that is not one of them. */
export function parseChip(value: string | null): BoardChip {
  return CHIP_ORDER.find((chip) => chip === value) ?? 'all'
}

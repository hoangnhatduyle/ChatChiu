// The four tiles above the board (F-KB-12): their words, their order and how ?show= is read. The rules that
// decide which items a tile holds live in the domain (`boardTileFilter`, AR-ONE-DEFINITION).
import { BOARD_TILES, type BoardTile } from '@chatchiu/domain'

export const TILE_ORDER: readonly BoardTile[] = BOARD_TILES

export const TILE_LABELS: Record<BoardTile, string> = {
  expired: 'Expired',
  today: 'Use today',
  low: 'Running low',
  fresh: 'Fresh',
}

export const TILE_CAPTIONS: Record<BoardTile, string> = {
  expired: 'Past their date',
  today: 'Today and the next 3 days',
  low: 'Low on quantity',
  fresh: 'Everything else',
}

/** The tile named by ?show=, or null (no filter) for anything that is not one of them, old values included. */
export function parseTile(value: string | null): BoardTile | null {
  return TILE_ORDER.find((tile) => tile === value) ?? null
}

const items = (n: number) => (n === 1 ? 'item' : 'items')
const places = (n: number) => (n === 1 ? 'place' : 'places')

/** What a screen reader hears when a tile filters the board (WCAG 4.1.3): "Showing 7 expired items in 4 places". */
export function tileAnnouncement(tile: BoardTile, count: number, placeCount: number): string {
  const what: Record<BoardTile, string> = {
    expired: `${count} expired ${items(count)}`,
    today: `${count} ${items(count)} to use today`,
    low: `${count} ${items(count)} running low`,
    fresh: `${count} fresh ${items(count)}`,
  }
  return `Showing ${what[tile]} in ${placeCount} ${places(placeCount)}`
}

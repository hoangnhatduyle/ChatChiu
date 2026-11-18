// The words of a reminder, in one place: the server's send job (web push) and the Fire's on-device schedule use
// the same text (AR-ONE-DEFINITION), so a reminder reads the same whichever way it arrives.
export type ReminderText = { title: string; body: string; url: string; tag: string }

const MAX_NAME = 60
const MAX_NAMES = 3

/** An item name as plain, short text: control characters removed, at most 60 characters. */
export function cleanName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const plain = name.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()
  return plain.length > MAX_NAME ? `${plain.slice(0, MAX_NAME - 1)}…` : plain
}

/** "A, B, C and 2 more": bounded, so a payload always fits Web Push's ~4 KB. */
export function nameList(names: readonly string[]): string {
  const shown = names.slice(0, MAX_NAMES).map(cleanName)
  const more = names.length - shown.length
  return more > 0 ? `${shown.join(', ')} and ${more} more` : shown.join(', ')
}

export function expiryReminder(names: readonly string[], localToday: string): ReminderText {
  const count = names.length
  return {
    title: count === 1 ? 'Item expiring soon' : `${count} items expiring soon`,
    body: count === 1 ? `${cleanName(names[0] ?? '')} expires soon` : nameList(names),
    url: '/stock?status=expiring',
    tag: `expiring-${localToday}`,
  }
}

export function lowStockReminder(names: readonly string[]): ReminderText {
  const count = names.length
  return {
    title: count === 1 ? 'Running low' : `${count} items running low`,
    body: count === 1 ? `${cleanName(names[0] ?? '')} is running low` : nameList(names),
    url: '/',
    tag: 'low-stock',
  }
}

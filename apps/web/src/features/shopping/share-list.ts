// Sends the list text out (F-SL-06): the system share sheet when there is one, else the clipboard.
// Closing the share sheet without sending is not an error.
export type ShareOutcome = 'shared' | 'cancelled' | 'copied' | 'failed'

const SHARE_TITLE = 'Shopping List'

export async function shareText(text: string): Promise<ShareOutcome> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: SHARE_TITLE, text })
      return 'shared'
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled'
      // The sheet could not open (a blocked context): try the clipboard instead.
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}

// Words for a receipt that could not be read or added (F-RS-03). Each cause says what she can do about it.
import { ApiClientError, userMessage } from '../../core/errors'

export function scanMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === 'QUOTA_EXCEEDED') {
      return "You've used this month's receipt scans. They reset next month. You can still add items one by one."
    }
    if (error.code === 'RATE_LIMITED') {
      return 'The receipt reader is busy right now. Wait a few seconds and try again.'
    }
    if (error.code === 'UNSUPPORTED_MEDIA_TYPE' || error.code === 'PAYLOAD_TOO_LARGE') {
      return "That photo couldn't be read as a photo of a receipt. Take it again, a bit closer and in good light."
    }
    if (error.kind === 'offline') return "You're offline. Scanning a receipt needs a connection."
  }
  return userMessage(error)
}

export function uploadMessage(error: unknown): string {
  return `Couldn't upload the photo. ${userMessage(error)}`
}

export function addMessage(error: unknown): string {
  // The server may have saved them although the answer never arrived: do not say "none" then. Pressing Add
  // again sends the same request key, so it cannot add them twice.
  if (error instanceof ApiClientError && error.outcomeUnknown) {
    return "We couldn't confirm whether your items were saved. Check the board, or press Add again: that is safe and won't add them twice."
  }
  return `None of your items were added. ${userMessage(error)}`
}

/** Words for a failure we did not expect while reading or adding: never a raw error text. */
export const UNEXPECTED_MESSAGE = 'Something went wrong with that receipt. Try again.'

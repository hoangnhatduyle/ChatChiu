// Receipt photo upload (step 5.10, F-RS-02): ask the API for a one-shot signed URL in her own folder
// (<uid>/receipts/<uuid>.jpg), then PUT the photo straight to storage. Like the AI calls it needs the network
// and is never queued, saved or replayed: the signed URL is a short-lived credential.
import { api } from '../core/api-client'
import { ApiClientError, type ClientErrorCode } from '../core/errors'
import { defineWrite } from './write'

type SignedUpload = { path: string; signedUrl: string; contentType: string }

/** A stalled upload ends instead of waiting forever. */
export const UPLOAD_TIMEOUT_MS = 60_000

function codeFor(status: number): ClientErrorCode {
  if (status === 413) return 'PAYLOAD_TOO_LARGE'
  if (status >= 500) return 'INTERNAL'
  return 'UNKNOWN'
}

export const uploadReceipt = defineWrite<{ photo: Blob }, { path: string }>({
  key: 'uploads/receipt',
  label: 'Upload a receipt',
  persist: false,
  request: async ({ photo }) => {
    const signed = await api.post<SignedUpload>(
      '/api/uploads/sign',
      { scope: 'receipts', contentType: 'image/jpeg', ext: 'jpg' },
      {},
    )
    let response: Response
    try {
      response = await fetch(signed.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: photo,
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      })
    } catch (cause) {
      const timedOut = cause instanceof DOMException && cause.name === 'TimeoutError'
      throw new ApiClientError({
        status: 0,
        code: timedOut ? 'TIMEOUT' : 'NETWORK',
        message: 'Upload failed',
        cause,
      })
    }
    if (!response.ok) {
      throw new ApiClientError({
        status: response.status,
        code: codeFor(response.status),
        message: `Upload failed (HTTP ${response.status})`,
      })
    }
    return { path: signed.path }
  },
})

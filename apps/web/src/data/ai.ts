// AI helpers (step 4.4): shelf-life suggestions and receipt scans. They need the network and cost
// money, so they are never queued, never saved with the cache, and never replayed after a reload:
// offline they fail at once and the screen says so. Nothing is written to the cache.
import type {
  ExpirationSuggestRequest,
  ExpirationSuggestion,
  ReceiptScanRequest,
  ReceiptScanResult,
} from '@chatchiu/contracts'
import { api } from '../core/api-client'
import { defineWrite } from './write'

export const expirationSuggest = defineWrite<
  ExpirationSuggestRequest,
  ExpirationSuggestion,
  undefined
>({
  key: 'ai/expiration-suggest',
  label: 'Suggest a shelf life',
  persist: false,
  request: (input, requestId) =>
    api.post<ExpirationSuggestion>('/api/ai/expiration-suggest', input, {
      idempotencyKey: requestId,
    }),
})

export const receiptScan = defineWrite<ReceiptScanRequest, ReceiptScanResult, undefined>({
  key: 'ai/receipt-scan',
  label: 'Read a receipt',
  persist: false,
  request: (input, requestId) =>
    api.post<ReceiptScanResult>('/api/ai/receipt-scan', input, { idempotencyKey: requestId }),
})

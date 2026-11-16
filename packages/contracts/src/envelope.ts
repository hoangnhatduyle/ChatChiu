// Response envelope shared by every route (architecture.md §3.4, NC-API-ENVELOPE).

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'METHOD_NOT_ALLOWED'
  | 'INTERNAL'

export interface Success<T> {
  data: T
}

export interface Failure {
  error: {
    code: ApiErrorCode
    message: string
    /** Only outside production. */
    details?: unknown
    /** Meal-slot 409 only: the plan already in that slot (AC-API-12). */
    existingId?: number
  }
}

export interface Deleted {
  deleted: true
}

export interface DeletedCount {
  deleted: number
}

// The receipt flow's states and the only moves between them (SPEC-RS-001 receipt_flow). `nextPhase` answers
// null for a move that is not allowed, so a screen can never skip a step: REVIEW never becomes DONE without a
// saved bulk request, and the AI only ever reads an image that was uploaded.
export type Phase =
  'CAPTURE' | 'COMPRESSING' | 'UPLOADING' | 'READING' | 'REVIEW' | 'ADDING' | 'DONE' | 'ERROR'

export type FlowEvent =
  | 'photo_chosen'
  | 'compressed'
  | 'compress_failed'
  | 'uploaded'
  | 'upload_failed'
  | 'items_read'
  | 'quota_busy_or_bad_image'
  | 'retry_or_new_photo'
  | 'add_selected'
  | 'bulk_ok'
  | 'bulk_error'
  | 'scan_another'

const MOVES: Readonly<Record<string, Phase>> = {
  'CAPTURE:photo_chosen': 'COMPRESSING',
  'COMPRESSING:compressed': 'UPLOADING',
  // Not in the spec's list but implied: a photo that cannot be shrunk or decoded ends in ERROR like a failed upload.
  'COMPRESSING:compress_failed': 'ERROR',
  'UPLOADING:uploaded': 'READING',
  'UPLOADING:upload_failed': 'ERROR',
  'READING:items_read': 'REVIEW',
  'READING:quota_busy_or_bad_image': 'ERROR',
  'ERROR:retry_or_new_photo': 'CAPTURE',
  'REVIEW:add_selected': 'ADDING',
  'ADDING:bulk_ok': 'DONE',
  'ADDING:bulk_error': 'REVIEW',
  'DONE:scan_another': 'CAPTURE',
}

export function nextPhase(phase: Phase, event: FlowEvent): Phase | null {
  return MOVES[`${phase}:${event}`] ?? null
}

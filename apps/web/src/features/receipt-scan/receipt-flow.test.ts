// SPEC-RS-001 receipt_flow: the allowed moves and the two forbidden ones.
import { describe, expect, it } from 'vitest'
import { nextPhase } from './receipt-flow'

describe('receipt flow', () => {
  it('walks CAPTURE -> COMPRESSING -> UPLOADING -> READING -> REVIEW -> ADDING -> DONE', () => {
    let phase = 'CAPTURE' as ReturnType<typeof nextPhase>
    for (const event of [
      'photo_chosen',
      'compressed',
      'uploaded',
      'items_read',
      'add_selected',
      'bulk_ok',
    ] as const) {
      phase = nextPhase(phase!, event)
    }
    expect(phase).toBe('DONE')
  })
  it('errors lead to ERROR and ERROR goes back to CAPTURE; a bulk error returns to REVIEW', () => {
    expect(nextPhase('UPLOADING', 'upload_failed')).toBe('ERROR')
    expect(nextPhase('COMPRESSING', 'compress_failed')).toBe('ERROR')
    expect(nextPhase('READING', 'quota_busy_or_bad_image')).toBe('ERROR')
    expect(nextPhase('ERROR', 'retry_or_new_photo')).toBe('CAPTURE')
    expect(nextPhase('ADDING', 'bulk_error')).toBe('REVIEW')
  })
  it('FORBID REVIEW -> DONE: items are only added after the bulk request succeeds', () => {
    expect(nextPhase('REVIEW', 'bulk_ok')).toBeNull()
  })
  it('FORBID CAPTURE -> READING: the AI only reads an uploaded image', () => {
    expect(nextPhase('CAPTURE', 'uploaded')).toBeNull()
    expect(nextPhase('CAPTURE', 'items_read')).toBeNull()
  })
})

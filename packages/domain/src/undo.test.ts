import { describe, expect, it } from 'vitest'
import { UNDO_WINDOW_MS } from './undo.js'

describe('undo window', () => {
  it('CS-NUMBERED-CONSTANTS: the Undo toast window is 5 s', () => {
    expect(UNDO_WINDOW_MS).toBe(5000)
  })
})

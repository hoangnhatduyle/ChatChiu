import { vi } from 'vitest'
import { createWriteGate } from './write-gate'

describe('createWriteGate', () => {
  it('NC-AP-NO-LOST-WRITES: saves nothing until the saved cache was restored', async () => {
    const gate = createWriteGate()
    const save = vi.fn(() => Promise.resolve())
    gate.setSave(save)
    expect(gate.saveIfRestored()).toBeUndefined()
    expect(save).not.toHaveBeenCalled()
    gate.setRestored(true)
    await gate.saveIfRestored()
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('stops saving again if the restore is reported as failed', () => {
    const gate = createWriteGate()
    gate.setSave(() => Promise.resolve())
    gate.setRestored(true)
    gate.setRestored(false)
    expect(gate.isRestored()).toBe(false)
    expect(gate.saveIfRestored()).toBeUndefined()
  })

  it('does nothing when no save function is registered yet', () => {
    const gate = createWriteGate()
    gate.setRestored(true)
    expect(gate.saveIfRestored()).toBeUndefined()
  })
})

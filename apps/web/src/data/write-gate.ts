// Shared by the write-ahead hook and the flush handlers in AppDataProvider: saving is allowed only once
// the saved cache has been read successfully (an earlier save would overwrite it with an empty one).
// A plain object with methods, so React code can hold it without mutating its own state.
export type WriteGate = {
  isRestored(): boolean
  setRestored(restored: boolean): void
  /** Registers how to save the current cache. */
  setSave(save: () => Promise<void>): void
  /** Saves now, if allowed. Resolves when the save is done (or at once when not allowed). */
  saveIfRestored(): Promise<void> | undefined
}

export function createWriteGate(): WriteGate {
  let restored = false
  let save: (() => Promise<void>) | undefined
  return {
    isRestored: () => restored,
    setRestored(next) {
      restored = next
    },
    setSave(next) {
      save = next
    },
    saveIfRestored: () => (restored ? save?.() : undefined),
  }
}

// Shared limits and parsing for the amount fields (SPEC-QP-001). The limits mirror the API contract
// (packages/contracts inventory.ts: MAX_AMOUNT, usage notes 500 characters); the web app does not import
// the contracts' runtime schemas, so they are repeated here.
export const MAX_AMOUNT = 1e9
export const NOTE_MAX_LENGTH = 500

/** A typed amount as a number ("1,5" and "1.5" both work); NaN for empty or not a number. */
export function parseAmount(text: string): number {
  const trimmed = text.trim()
  const value = Number(trimmed.replace(',', '.'))
  return trimmed === '' || !Number.isFinite(value) ? Number.NaN : value
}

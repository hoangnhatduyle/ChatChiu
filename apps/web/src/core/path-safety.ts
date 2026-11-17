// Shared by the return-path check (auth-paths.ts) and the API client's own-path check (api-client.ts).
const LAST_CONTROL_CODE = 0x1f
const DELETE_CODE = 0x7f

/** True when `value` holds a control character. The URL parser drops tabs and newlines, so "/\t/evil.example" would become "//evil.example". */
export function hasControlCharacter(value: string): boolean {
  return [...value].some((ch) => {
    const code = ch.charCodeAt(0)
    return code <= LAST_CONTROL_CODE || code === DELETE_CODE
  })
}

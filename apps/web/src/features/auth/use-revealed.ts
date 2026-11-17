// Reveal state for a form's password fields, shared by login, register and reset.
import { useState } from 'react'

/** State for the reveal box: `revealed` goes to the fields, `toggle` to <ShowPasswordsBox />. */
export function useRevealed(): { revealed: boolean; toggle: (next: boolean) => void } {
  const [revealed, setRevealed] = useState(false)
  return { revealed, toggle: setRevealed }
}

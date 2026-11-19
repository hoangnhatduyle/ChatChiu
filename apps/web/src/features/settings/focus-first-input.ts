/** After a validation error: puts focus on the first text field of the form, so the error is read in place (7.0.32c). */
export function focusFirstInput(group: HTMLElement | null): void {
  requestAnimationFrame(() => group?.querySelector<HTMLInputElement>('input')?.focus())
}

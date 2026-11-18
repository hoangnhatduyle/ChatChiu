// Hands a text file to the browser as a download. The link is attached and the URL freed a moment later, so no
// browser cancels the download by revoking it too early.
const REVOKE_DELAY_MS = 10_000

export function downloadTextFile(
  name: string,
  text: string,
  type = 'text/csv;charset=utf-8',
): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}

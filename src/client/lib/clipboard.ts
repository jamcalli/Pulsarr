/** Resolves true only when the text reached the clipboard. */
export async function copyText(value: string): Promise<boolean> {
  // navigator.clipboard is undefined outside a secure context, such as plain HTTP on a LAN address.
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(value).then(
      () => true,
      () => false,
    )
  }
  const previousFocus = document.activeElement
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.readOnly = true
  textarea.className = 'sr-only'
  document.body.appendChild(textarea)
  textarea.focus({ preventScroll: true })
  textarea.select()
  textarea.setSelectionRange(0, value.length)
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea.remove()
    if (previousFocus instanceof HTMLElement) previousFocus.focus()
  }
}

import DOMPurify, { type WindowLike } from 'dompurify'

/** Builds a sanitizer bound to `win` that drops GitHub heading permalink anchors and opens links in a new tab. */
export function createReleaseNotesSanitizer(win: WindowLike) {
  const purify = DOMPurify(win)

  purify.addHook('uponSanitizeElement', (node) => {
    if (
      node.nodeName === 'A' &&
      node instanceof win.Element &&
      node.classList.contains('anchor')
    ) {
      node.remove()
    }
  })

  purify.addHook('afterSanitizeAttributes', (node) => {
    if (
      node.nodeName === 'A' &&
      node instanceof win.Element &&
      node.hasAttribute('href')
    ) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
  })

  return (html: string): string =>
    purify.sanitize(html, { ADD_ATTR: ['target'] })
}

export const sanitizeReleaseNotes = createReleaseNotesSanitizer(window)

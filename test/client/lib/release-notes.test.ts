import { JSDOM } from 'jsdom'
import { createReleaseNotesSanitizer } from '@/lib/release-notes'

// DOMPurify supports jsdom, not happy-dom, so the sanitizer under test gets a real jsdom window.
const { window: jsdomWindow } = new JSDOM('')
const sanitizeReleaseNotes = createReleaseNotesSanitizer(jsdomWindow)

function render(html: string): HTMLElement {
  const container = jsdomWindow.document.createElement('div')
  container.innerHTML = sanitizeReleaseNotes(html)
  return container
}

describe('sanitizeReleaseNotes', () => {
  it('removes scripts and inline handlers', () => {
    const container = render(
      '<p onclick="alert(1)">Notes</p><script>alert(1)</script><img src="x" onerror="alert(1)">',
    )
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('[onclick]')).toBeNull()
    expect(container.querySelector('[onerror]')).toBeNull()
    expect(container.textContent).toBe('Notes')
  })

  it('drops GitHub heading permalink anchors but keeps the heading', () => {
    const container = render(
      '<div class="markdown-heading"><h2 class="heading-element">Features</h2><a id="user-content-features" class="anchor" href="#features"><svg class="octicon"></svg></a></div>',
    )
    expect(container.querySelector('h2')?.textContent).toBe('Features')
    expect(container.querySelector('a')).toBeNull()
  })

  it('opens links in a new tab without leaking the opener', () => {
    const container = render(
      '<p>See <a href="https://github.com/jamcalli/Pulsarr/pull/1">#1</a></p>',
    )
    const link = container.querySelector('a')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('blocks javascript links', () => {
    const container = render('<a href="javascript:alert(1)">x</a>')
    expect(container.querySelector('a')?.getAttribute('href')).toBeNull()
  })
})

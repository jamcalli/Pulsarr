import { useState } from 'react'
import TurndownService from 'turndown'

import { Copy, Check } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { invariant } from '@epic-web/invariant'
import { toast } from 'sonner'

// Create singleton instance to avoid recreating on every copy operation
const turndownService = new TurndownService()

interface CopyButtonProps extends React.ComponentProps<typeof Button> {
  /**
   * Plain text content to copy to clipboard. Takes precedence over auto-generated plain-text version if HTML is provided.
   */
  text?: string

  /**
   * HTML content to copy to clipboard. Will be converted to markdown for plain text format.
   * Used when text prop is not provided.
   */
  html?: string

  /**
   * React ref to an HTML element whose innerHTML will be copied.
   * Used as fallback when neither text nor html props are provided.
   */
  htmlRef?: React.RefObject<HTMLElement | null>

  /**
   * Whether to show the button as icon-only (no text label)
   */
  iconOnly?: boolean
}

/**
 * Renders a button that copies provided text, HTML content, or the contents of a referenced HTML element to the clipboard.
 *
 * If plain text is not provided, HTML content is converted to plain text before copying. Supports both modern and legacy clipboard APIs, and provides user feedback via icon and toast notification. The button can be rendered as icon-only or with a label.
 */
export function CopyButton({
  text,
  html,
  htmlRef,
  className,
  iconOnly = false,
  variant = 'noShadow',
  size = 'sm',
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = async () => {
    try {
      if (!text && !html && !htmlRef?.current) {
        console.error('No text, HTML, or HTML reference to copy')
        return
      }

      const htmlContent = html || htmlRef?.current?.innerHTML || ''
      let textContent = text

      if (!textContent && htmlContent) {
        textContent = turndownService.turndown(htmlContent)
      }

      invariant(
        textContent,
        'textContent should exist. If you are using htmlRef, make sure to pass a ref to the html element.',
      )

      // Check if clipboard API is available
      if (navigator.clipboard && window.isSecureContext) {
        if (htmlContent) {
          const clipboardData = new ClipboardItem({
            'text/plain': new Blob([textContent], { type: 'text/plain' }),
            'text/html': new Blob([htmlContent], { type: 'text/html' }),
          })
          await navigator.clipboard.write([clipboardData])
        } else {
          await navigator.clipboard.writeText(textContent)
        }
      } else {
        // Fallback for non-secure contexts or older browsers
        const textArea = document.createElement('textarea')
        textArea.value = textContent
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        document.execCommand('copy')
        textArea.remove()
      }

      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success('Copied to clipboard!')
    } catch (err) {
      console.error('Failed to copy text:', err)
    }
  }

  if (iconOnly) {
    return (
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={copyToClipboard}
        {...props}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    )
  }

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={copyToClipboard}
      {...props}
    >
      {copied ? (
        <Check className="mr-2 h-4 w-4" />
      ) : (
        <Copy className="mr-2 h-4 w-4" />
      )}
      {copied ? 'Copied!' : 'Copy to Clipboard'}
    </Button>
  )
}

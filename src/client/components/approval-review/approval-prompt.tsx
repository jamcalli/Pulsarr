import type { ReactNode } from 'react'

interface ApprovalPromptProps {
  title: string
  description: string
  children?: ReactNode
}

export function ApprovalPrompt({
  title,
  description,
  children,
}: ApprovalPromptProps) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-heading font-bold">{title}</h3>
        <p className="text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  )
}

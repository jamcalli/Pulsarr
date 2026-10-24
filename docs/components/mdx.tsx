import defaultMdxComponents from '@fumadocs/base-ui/mdx'
import type { MDXComponents } from 'mdx/types'
import { CalloutContainer, CalloutDescription } from '@/components/callout'
import { AlertTitle } from '@/components/ui/alert'

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    CalloutContainer,
    CalloutTitle: AlertTitle,
    CalloutDescription,
    ...components,
  } satisfies MDXComponents
}

export const useMDXComponents = getMDXComponents

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>
}

import { remarkDirectiveAdmonition } from 'fumadocs-core/mdx-plugins'
import { defineConfig } from 'fumadocs-mdx/config'
import remarkDirective from 'remark-directive'
import { CALLOUT_VARIANTS } from './lib/callout'

const calloutTypes = Object.fromEntries(
  Object.keys(CALLOUT_VARIANTS).map((type) => [type, type]),
)

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [
      remarkDirective,
      [remarkDirectiveAdmonition, { types: calloutTypes }],
    ],
  },
})

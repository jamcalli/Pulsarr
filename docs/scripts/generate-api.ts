import { readFile } from 'node:fs/promises'
import { generateFiles } from 'fumadocs-openapi'
import { openapi } from '../lib/openapi.ts'

const spec = JSON.parse(await readFile('./public/openapi.json', 'utf8')) as {
  info: { title: string }
}
const indexPage = await readFile('./lib/api-index.mdx', 'utf8')

await generateFiles({
  input: openapi,
  output: './content/docs/api',
  per: 'operation',
  groupBy: 'tag',
  includeDescription: true,
  meta: true,
  beforeWrite(files) {
    const rootMeta = files.find((file) => file.path === 'meta.json')
    if (!rootMeta)
      throw new Error('fumadocs-openapi produced no root meta.json')
    const meta = JSON.parse(rootMeta.content) as { pages?: string[] }
    rootMeta.content = JSON.stringify(
      {
        ...meta,
        title: spec.info.title,
        pages: ['index', ...(meta.pages ?? [])],
      },
      null,
      2,
    )
    files.push({ path: 'index.mdx', content: indexPage })
  },
})

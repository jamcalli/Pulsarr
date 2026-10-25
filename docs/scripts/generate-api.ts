import { readFile } from 'node:fs/promises'
import { generateFiles } from 'fumadocs-openapi'
import { openapi } from '../lib/openapi.ts'

interface GeneratedFile {
  path: string
  content: string
}

interface FolderMeta {
  title?: string
  root?: boolean
  pages?: string[]
}

const spec = JSON.parse(await readFile('./public/openapi.json', 'utf8')) as {
  info: { title: string }
}
const indexPage = await readFile('./lib/api-index.mdx', 'utf8')
const webhookPayloadsIndex = await readFile(
  './lib/webhook-payloads-index.mdx',
  'utf8',
)

function addIndexPage(
  files: GeneratedFile[],
  dir: string,
  content: string,
  extraMeta: Omit<FolderMeta, 'pages'> = {},
) {
  const metaPath = dir ? `${dir}/meta.json` : 'meta.json'
  const meta = files.find((file) => file.path === metaPath)
  if (!meta) throw new Error(`fumadocs-openapi produced no ${metaPath}`)
  const parsed = JSON.parse(meta.content) as FolderMeta
  meta.content = JSON.stringify(
    { ...parsed, ...extraMeta, pages: ['index', ...(parsed.pages ?? [])] },
    null,
    2,
  )
  files.push({ path: dir ? `${dir}/index.mdx` : 'index.mdx', content })
}

await generateFiles({
  input: openapi,
  output: './content/docs/api',
  per: 'operation',
  groupBy: 'tag',
  includeDescription: true,
  meta: true,
  beforeWrite(files) {
    addIndexPage(files, '', indexPage, {
      title: spec.info.title,
      root: true,
    })
    addIndexPage(files, 'webhook-payloads', webhookPayloadsIndex)
  },
})

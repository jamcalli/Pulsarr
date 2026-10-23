import { readFile } from 'node:fs/promises';
import { generateFiles } from 'fumadocs-openapi';
import { openapi } from '../lib/openapi.ts';

const spec = JSON.parse(await readFile('./public/openapi.json', 'utf8')) as { info: { title: string } };

await generateFiles({
  input: openapi,
  output: './content/docs/api',
  per: 'operation',
  groupBy: 'tag',
  includeDescription: true,
  meta: true,
  beforeWrite(files) {
    const rootMeta = files.find((file) => file.path === 'meta.json');
    if (!rootMeta) throw new Error('fumadocs-openapi produced no root meta.json');
    rootMeta.content = JSON.stringify({ ...JSON.parse(rootMeta.content), title: spec.info.title }, null, 2);
  },
});

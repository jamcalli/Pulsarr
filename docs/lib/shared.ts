import { createGetUrl } from 'fumadocs-core/source';

export const appName = 'Pulsarr';
export const siteOrigin = 'https://jamcalli.github.io';
export const basePath = '/Pulsarr';
export const docsRoute = '/';
export const docsImageRoute = '/og/docs';
export const docsContentRoute = '/llms.mdx/docs';

export const gitConfig = {
  user: 'jamcalli',
  repo: 'Pulsarr',
  branch: 'master',
};

const getContentUrl = createGetUrl(`${basePath}${docsContentRoute}`);

export function getPageMarkdownUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, 'content.md'];

  return { segments, url: getContentUrl(segments, page.locale) };
}

const getImageUrl = createGetUrl(`${basePath}${docsImageRoute}`);

export function getPageImageUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, 'image.png'];

  return { segments, url: getImageUrl(segments, page.locale) };
}

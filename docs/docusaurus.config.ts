import { themes as prismThemes } from 'prism-react-renderer'
import type { Config } from '@docusaurus/types'
import type * as Preset from '@docusaurus/preset-classic'
import path from 'node:path'

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'Pulsarr',
  tagline:
    'Real-time Plex watchlist monitoring, routing, and notification center',
  favicon: 'img/favicon.ico',

  // Set the production url of your site here
  url: 'https://docs.pulsarr.app',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'jamcalli', // Usually your GitHub org/user name.
  projectName: 'pulsarr', // Usually your repo name.

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  plugins: [
    (context, options) => ({
      name: 'resolve-client-components',
      configureWebpack(config, isServer, utils) {
        return {
          resolve: {
            alias: {
              '@/components': path.resolve(
                __dirname,
                '../src/client/components',
              ),
              '@/client/components': path.resolve(
                __dirname,
                '../src/client/components',
              ),
              '@/client/lib': path.resolve(__dirname, '../src/client/lib'),
              '@/client/assets': path.resolve(
                __dirname,
                '../src/client/assets',
              ),
              '@/client/hooks': path.resolve(__dirname, '../src/client/hooks'),
              '@/client': path.resolve(__dirname, '../src/client'),
              '@/lib': path.resolve(__dirname, '../src/client/lib'),
              '@': path.resolve(__dirname, '../src'),
            },
            extensions: ['.js', '.jsx', '.ts', '.tsx'],
          },
          module: {
            rules: [
              {
                test: /\.(png|jpe?g|gif|webp|svg)$/i,
                type: 'asset/resource',
              },
            ],
          },
        }
      },
    }),
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/jamcalli/pulsarr/edit/main/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/docusaurus-social-card.jpg',
    navbar: {
      title: 'Pulsarr',
      logo: {
        alt: 'Pulsarr Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          type: 'html',
          value: '<div id="github-stats-button"></div>',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Getting Started',
              to: '/docs/intro',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/jamcalli/pulsarr',
            },
            {
              label: 'Issues',
              href: 'https://github.com/jamcalli/pulsarr/issues',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'Pulsarr App',
              href: 'https://github.com/jamcalli/pulsarr',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Pulsarr. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,

  themes: [],
}

export default config

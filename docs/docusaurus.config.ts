import { readFileSync } from 'node:fs'
import path from 'node:path'
import type * as Preset from '@docusaurus/preset-classic'
import type { Config } from '@docusaurus/types'
import dotenv from 'dotenv'
import { themes as prismThemes } from 'prism-react-renderer'

// Load environment variables
dotenv.config()

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

// Read package.json to expose version for client
const packageJson = JSON.parse(
  readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'),
)

const config: Config = {
  title: 'Pulsarr',
  tagline:
    'Real-time Plex watchlist monitoring, routing, and notification center',
  favicon: 'img/favicon.ico',

  // Set the production url of your site here
  url: 'https://jamcalli.github.io',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/Pulsarr/',

  // GitHub Pages trailing slash behavior
  trailingSlash: false,

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'jamcalli', // Usually your GitHub org/user name.
  projectName: 'Pulsarr', // Usually your repo name.

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  customFields: {
    version: packageJson.version,
  },

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  plugins: [
    './src/plugins/tailwind-config.js',
    [
      'docusaurus-plugin-openapi-docs',
      {
        id: 'api',
        docsPluginId: 'classic',
        config: {
          pulsarr: {
            specPath: 'static/openapi.json',
            outputDir: 'docs/api',
            sidebarOptions: {
              groupPathsBy: 'tag',
              categoryLinkSource: 'tag',
            },
          },
        },
      },
    ],
    (_context, _options) => ({
      name: 'resolve-client-components',
      configureWebpack(_config, _isServer, _utils) {
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
              '@/hooks': path.resolve(__dirname, '../src/client/hooks'),
              '@/features': path.resolve(__dirname, '../src/client/features'),
              '@/stores': path.resolve(__dirname, '../src/client/stores'),
              '@root': path.resolve(__dirname, '../src'),
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
              {
                test: /\.s[ac]ss$/i,
                exclude: /node_modules/,
                use: [
                  'style-loader',
                  'css-loader',
                  {
                    loader: 'sass-loader',
                    options: {
                      implementation: require('sass'),
                    },
                  },
                ],
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
          docItemComponent: '@theme/ApiItem', // Derived from docusaurus-theme-openapi
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
    image: 'img/pulsarr-social-card.png',
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
    algolia: {
      appId: process.env.ALGOLIA_APP_ID || '',
      apiKey: process.env.ALGOLIA_SEARCH_API_KEY || '',
      indexName: process.env.ALGOLIA_INDEX_NAME || '',
      contextualSearch: true,
      searchParameters: {},
      searchPagePath: 'search',
    },
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
            {
              label: 'License (GPL)',
              href: 'https://github.com/jamcalli/pulsarr/blob/main/LICENSE',
            },
          ],
        },
      ],
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,

  themes: ['docusaurus-theme-openapi-docs'],
}

export default config

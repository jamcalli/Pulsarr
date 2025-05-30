import type { SidebarsConfig } from '@docusaurus/plugin-content-docs'
import apiSidebar from './docs/api/sidebar'

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */
const sidebars: SidebarsConfig = {
  // By default, Docusaurus generates a sidebar from the docs folder structure
  tutorialSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Installation',
      items: ['installation/quick-start', 'installation/configuration'],
    },
    {
      type: 'category',
      label: 'Features',
      items: ['features/content-routing'],
    },
    {
      type: 'category',
      label: 'Notifications',
      items: [
        'notifications/discord',
        'notifications/apprise',
        'notifications/tautulli',
      ],
    },
    {
      type: 'category',
      label: 'Utilities',
      items: [
        'utilities/delete-sync',
        'utilities/user-tagging',
        'utilities/session-monitoring',
        'utilities/plex-notifications',
      ],
    },
    'architecture',
    'contributing',
    {
      type: 'category',
      label: 'API Reference',
      collapsed: false,
      items: apiSidebar,
    },
  ],
}

export default sidebars

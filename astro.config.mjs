// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import pagefind from 'astro-pagefind';

// https://astro.build/config
export default defineConfig({
  site: 'https://breaking-trail.vercel.app',
  vite: {
    plugins: [tailwindcss()]
  },
  integrations: [mdx(), sitemap(), pagefind()]
});

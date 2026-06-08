// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Update this to your production domain so canonical URLs / sitemap are correct.
const SITE = process.env.PUBLIC_SITE_URL || 'https://shr7.org';

// https://astro.build/config
export default defineConfig({
  site: SITE,
  output: 'server',
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
    imageService: 'compile',
  }),
  integrations: [
    sitemap({
      // Exclude short links, the API, the noindex report page, and 404.
      filter: (page) => !/\/(report|404)\/?$/.test(page) && !page.includes('/api/'),
      changefreq: 'weekly',
      priority: 0.7,
      lastmod: new Date(),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});


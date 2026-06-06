// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
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
  vite: {
    plugins: [tailwindcss()],
  },
});

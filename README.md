# Snip — URL Shortener

A fast, SEO-friendly URL shortener with built-in click analytics, built with
**Astro** and deployed on **Cloudflare Pages** with a **D1** database.
Monetized with **Google AdSense**, styled with a warm, claude.ai-inspired theme.

## Features

- **Shorten links** with optional custom aliases
- **Edge redirects** via Cloudflare Pages Functions (millisecond latency)
- **Real-time statistics** page — total clicks, 7-day trend, top referrers & countries
- **SEO optimized** — server-rendered Astro pages, canonical tags, Open Graph,
  JSON-LD structured data, `sitemap.xml` and `robots.txt`
- **AdSense ready** — drop in your publisher ID to start monetizing
- **Privacy-friendly** — no accounts, no IP storage, only aggregate click data

## Tech stack

| Layer     | Choice                                   |
| --------- | ---------------------------------------- |
| UI        | Astro 5 (SSR) + Tailwind CSS 4           |
| Hosting   | Cloudflare Pages (`@astrojs/cloudflare`) |
| Storage   | Cloudflare D1 (SQLite at the edge)       |
| Ads       | Google AdSense                           |

## Project structure

```
src/
  components/   AdSense, Header, Footer
  layouts/      Layout.astro (SEO head, AdSense loader)
  lib/          db.ts (D1 access), shorten.ts (codes + URL validation)
  pages/
    index.astro          home + shorten form
    stats.astro          statistics lookup + charts
    [code].ts            root-level redirect handler
    404.astro
    sitemap.xml.ts
    api/
      shorten.ts         POST: create a short link
      stats/[code].ts    GET: aggregated analytics
schema.sql      D1 tables (links, clicks)
wrangler.toml   Cloudflare bindings & vars
```

## Getting started

### 1. Install

```bash
npm install
```

### 2. Create the D1 database

```bash
npx wrangler d1 create url_shortener
```

Copy the printed `database_id` into `wrangler.toml` (the `[[d1_databases]]`
section).

### 3. Initialize the schema

```bash
npm run db:init          # local dev database
npm run db:init:remote   # production database
```

### 4. Configure environment

Set these in `wrangler.toml` `[vars]` (or the Cloudflare dashboard). For local
dev, copy `.env.example` to `.dev.vars`:

- `PUBLIC_SITE_URL` — your production URL, e.g. `https://snip.example.com`
- `PUBLIC_ADSENSE_CLIENT` — your AdSense publisher ID, e.g. `ca-pub-1234…`
  (leave empty to disable ads)

### 5. Develop

```bash
npm run dev
```

Astro's dev server uses `platformProxy` to provide a local D1 binding.

### 6. Deploy

```bash
npm run deploy
```

This builds the site and runs `wrangler pages deploy ./dist`. Alternatively,
connect the repo to Cloudflare Pages for automatic deploys on push.

## Enabling AdSense

1. Get approved at [adsense.google.com](https://adsense.google.com).
2. Set `PUBLIC_ADSENSE_CLIENT` to your `ca-pub-…` ID.
3. Edit `public/ads.txt` and replace the placeholder publisher ID.
4. Create ad units in the AdSense dashboard and put each numeric slot id into
   the `<AdSense slot="…" />` components in `index.astro` / `stats.astro`.

Until a publisher ID is set, ad slots render as neutral placeholders so the
layout doesn't shift during development.

## API

| Method | Endpoint            | Description                          |
| ------ | ------------------- | ------------------------------------ |
| `POST` | `/api/shorten`      | Body `{ url, alias? }` → short link  |
| `GET`  | `/api/stats/:code`  | Aggregated analytics for a code      |
| `GET`  | `/:code`            | 302 redirect to the destination      |
```

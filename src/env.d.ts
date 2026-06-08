/// <reference path="../.astro/types.d.ts" />

type D1Database = import('@cloudflare/workers-types').D1Database;

interface Env {
  DB: D1Database;
  PUBLIC_SITE_URL?: string;
  PUBLIC_ADSENSE_CLIENT?: string;
  PUBLIC_GA_MEASUREMENT_ID?: string; // Google Analytics 4 measurement ID
  // Abuse prevention
  PUBLIC_TURNSTILE_SITE_KEY?: string; // public, rendered in the form
  TURNSTILE_SECRET_KEY?: string; // secret, set via `wrangler secret put`
  SAFE_BROWSING_API_KEY?: string; // secret, set via `wrangler secret put`
}

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}

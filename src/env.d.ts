/// <reference path="../.astro/types.d.ts" />

type D1Database = import('@cloudflare/workers-types').D1Database;

interface Env {
  DB: D1Database;
  PUBLIC_SITE_URL?: string;
  PUBLIC_ADSENSE_CLIENT?: string;
}

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}

import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * OpenNext → Cloudflare Workers config. Minimal for a first deploy: no
 * incremental-cache override, so ISR / `unstable_cache` recompute rather than
 * persist across instances. To make the public-dashboard cache durable later,
 * create an R2 bucket + binding and pass `incrementalCache: r2IncrementalCache`
 * here (see @opennextjs/cloudflare docs).
 */
export default defineCloudflareConfig({});

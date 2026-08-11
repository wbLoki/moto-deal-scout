import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep native/heavy packages out of the Next bundle. `@libsql/isomorphic-ws`
  // (and friends) publish a `workerd` export (`web.mjs`) that OpenNext only
  // copies into `.open-next` when listed here — otherwise Cloudflare builds
  // fail with "Could not resolve @libsql/isomorphic-ws".
  serverExternalPackages: [
    '@libsql/client',
    '@libsql/hrana-client',
    '@libsql/isomorphic-ws',
    '@sparticuz/chromium',
    'playwright-core',
    'pino',
  ],

  // The shared src/ code uses NodeNext-style `.js` import specifiers that
  // actually point at `.ts` files (so the CLI can build with tsc). Teach
  // webpack the same mapping so the Next build can resolve them.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

// Lets `next dev` see the Cloudflare bindings declared in wrangler.jsonc.
// No-op during production builds.
initOpenNextCloudflareForDev();

export default nextConfig;

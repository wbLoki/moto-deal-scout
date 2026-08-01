/** @type {import('next').NextConfig} */
const nextConfig = {
  // These pull in native binaries / large runtime assets and must stay as
  // real Node requires at runtime rather than being bundled by webpack.
  serverExternalPackages: ['@sparticuz/chromium', 'playwright-core', '@libsql/client', 'pino'],

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

export default nextConfig;

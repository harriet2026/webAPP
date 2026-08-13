import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');


const devOrigins = process.env.WEBAPP_DEV_ORIGINS
  ? process.env.WEBAPP_DEV_ORIGINS.split(',').map((s) => s.trim())
  : ['localhost'];

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone' as const,
  // The HTML-spec and MD-spec routes read a validated dynamic path at
  // runtime. Include only their asset trees instead of letting NFT trace
  // the whole project.
  outputFileTracingIncludes: {
    '/html-spec/*': ['./doc/html-spec/**/*', './doc/html_spec-version/**/*'],
    '/md-spec/*': ['./doc/md_spec-version/**/*'],
  },
  allowedDevOrigins: devOrigins,
};

export default withNextIntl(nextConfig);

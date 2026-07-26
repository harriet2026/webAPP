import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');


const devOrigins = process.env.WEBAPP_DEV_ORIGINS
  ? process.env.WEBAPP_DEV_ORIGINS.split(',').map((s) => s.trim())
  : ['localhost'];

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone' as const,
  allowedDevOrigins: devOrigins,
};

export default withNextIntl(nextConfig);

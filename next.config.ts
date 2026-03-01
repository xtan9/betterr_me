import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
import withBundleAnalyzer from '@next/bundle-analyzer';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'radix-ui',
      'date-fns',
      '@tiptap/starter-kit',
      '@tiptap/react',
      '@tiptap/pm',
      '@tiptap/extensions',
      '@tiptap/extension-list',
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

const analyzer = withBundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });

export default analyzer(withNextIntl(nextConfig));

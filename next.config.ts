import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
import withBundleAnalyzer from '@next/bundle-analyzer';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
  experimental: {
    authInterrupts: true,
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
      // ExerciseDB animated GIF CDN
      {
        protocol: 'https',
        hostname: 'v2.exercisedb.io',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

const analyzer = withBundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });

export default analyzer(withNextIntl(nextConfig));

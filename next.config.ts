import type { NextConfig } from 'next';

const productionApiOrigin = 'http://13.201.29.22:5001';

const normalizeApiOrigin = (value?: string) => {
  const configured = value?.trim();

  if (!configured || configured.startsWith('/')) {
    return productionApiOrigin;
  }

  return configured.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
};

const apiOrigin = normalizeApiOrigin(process.env.NEXT_PUBLIC_API_URL);
const wsOrigin = apiOrigin.replace(/^http/, 'ws');

const s3UploadConnectOrigins = [
  'https://medkwik-healthbuddy-storage.s3.eu-north-1.amazonaws.com',
  'https://*.amazonaws.com',
].join(' ');

const nextConfig: NextConfig = {
  // ─── Security Headers (Firewall-level protection) ──────────────────
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent clickjacking
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          // Prevent MIME-type sniffing attacks
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          // Referrer policy
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // Restrict browser features
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=*',
          },
          // HTTP Strict Transport Security (HTTPS only)
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          // XSS protection (legacy browsers)
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          // ─── Cross-Origin policies ──────────────────────────────────────
          // Must be 'unsafe-none' to allow Google Sign-In postMessage calls.
          // 'same-origin' blocks Google OAuth popup communication entirely.
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'unsafe-none',
          },
          // Content Security Policy
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Scripts: self + Next.js inline + Firebase + Google APIs + Razorpay (checkout + CDN)
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com https://apis.google.com https://accounts.google.com https://challenges.cloudflare.com https://checkout.razorpay.com https://cdn.razorpay.com https://api.razorpay.com",
              // Styles: self + inline styles (needed for Tailwind)
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
              // Fonts
              "font-src 'self' https://fonts.gstatic.com",
              // Images: self + data URIs + Firebase storage + S3 + Razorpay
              "img-src 'self' data: blob: https://*.firebaseapp.com https://*.googleapis.com https://*.googleusercontent.com https://medkwik-healthbuddy-storage.s3.eu-north-1.amazonaws.com https://*.amazonaws.com https://cdn.razorpay.com https://checkout.razorpay.com",
              // Connect: self + API + Firebase + FCM + Razorpay (API + CDN + analytics)
              `connect-src 'self' ${apiOrigin} ${wsOrigin} ws://localhost:3000 ws://127.0.0.1:3000 wss://api.medikwikhealthbuddy.in ${s3UploadConnectOrigins} https://*.googleapis.com https://fcm.googleapis.com https://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://challenges.cloudflare.com https://accounts.google.com https://fonts.googleapis.com https://fonts.gstatic.com https://api.razorpay.com https://cdn.razorpay.com https://lumberjack.razorpay.com https://checkout.razorpay.com`,
              // Workers: self (for service worker)
              "worker-src 'self' blob:",
              // Manifest
              "manifest-src 'self'",
              // Frames: only Google OAuth + Cloudflare Turnstile + Razorpay Iframe Overlay
              "frame-src https://accounts.google.com https://challenges.cloudflare.com https://api.razorpay.com https://checkout.razorpay.com",
              // Form actions
              "form-action 'self'",
              // Upgrade insecure requests in production
              ...(process.env.NODE_ENV === 'production' ? ['upgrade-insecure-requests'] : []),
            ].join('; '),
          },

        ],
      },
      // ─── Service Worker: allow service-worker-allowed header ────────
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
      {
        source: '/firebase-messaging-sw.js',
        headers: [
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
      // ─── Manifest: proper MIME type ─────────────────────────────────
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/manifest+json',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
    ];
  },
};

export default nextConfig;

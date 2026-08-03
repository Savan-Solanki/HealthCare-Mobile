import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import PWAInit from '@/components/ui/pwa-init';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'healthcare Patient',
    template: '%s | healthcare Patient',
  },
  description:
    'Manage your appointments, health records, and consult doctors all in one place.',
  keywords: ['health', 'patient', 'appointments', 'medical records', 'doctor consultation'],
  authors: [{ name: 'MedkwikHealthbuddy' }],
  robots: 'index, follow',
  // ─── PWA Manifest ──────────────────────────────────────────────────
  manifest: '/manifest.json',
  // ─── Apple / iOS Meta ──────────────────────────────────────────────
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'healthcare',
  },
  // ─── Open Graph ────────────────────────────────────────────────────
  openGraph: {
    title: 'healthcare Patient',
    description: 'Manage your appointments, health records, and consult doctors.',
    type: 'website',
    locale: 'en_IN',
  },
  // ─── Icons ─────────────────────────────────────────────────────────
  icons: {
    icon: [
      { url: '/android/launchericon-48x48.png', sizes: '48x48', type: 'image/png' },
      { url: '/android/launchericon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/android/launchericon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/android/launchericon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/ios/76.png', sizes: '76x76', type: 'image/png' },
      { url: '/ios/120.png', sizes: '120x120', type: 'image/png' },
      { url: '/ios/152.png', sizes: '152x152', type: 'image/png' },
      { url: '/ios/167.png', sizes: '167x167', type: 'image/png' },
      { url: '/ios/180.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: [{ url: '/android/launchericon-192x192.png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0d9488',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        {/* iOS PWA splash / home-screen meta */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="medikwik" />
        {/* Windows tile color */}
        <meta name="msapplication-TileColor" content="#0d9488" />
        <meta name="msapplication-TileImage" content="/windows/Square150x150Logo.scale-100.png" />
        <meta name="msapplication-config" content="none" />
        {/* Prevent phone number detection on iOS */}
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body className="antialiased min-h-screen" suppressHydrationWarning>
        {children}
        <Toaster position="top-center" richColors closeButton />
        {/* PWA: Service Worker registration + Push Notification setup */}
        <PWAInit />
      </body>
    </html>
  );
}

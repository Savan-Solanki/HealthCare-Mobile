/**
 * On HTTPS pages (Vercel production), direct browser requests to S3 presigned
 * URLs fail with 403 due to CORS restrictions. This utility converts such URLs
 * to go through the local /api/media-proxy endpoint instead, which fetches the
 * image server-side and streams it back.
 *
 * On HTTP (local dev), the original URL is returned unchanged.
 */
export const proxyImageUrl = (url: string | null | undefined): string | null => {
  if (!url || url.trim() === '') return null;

  // Only proxy on HTTPS pages (production Vercel)
  if (typeof window === 'undefined' || window.location?.protocol !== 'https:') {
    return url;
  }

  // Only proxy S3 / amazonaws URLs
  if (!url.includes('amazonaws.com')) {
    return url;
  }

  return `/api/media-proxy?url=${encodeURIComponent(url)}`;
};

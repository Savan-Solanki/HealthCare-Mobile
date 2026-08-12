import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy endpoint that fetches an image from its original URL (typically an S3
 * presigned URL) server-side and streams it back to the browser.
 *
 * This bypasses S3 CORS restrictions that block direct browser access from
 * HTTPS Vercel origins.
 *
 * Usage: /api/media-proxy?url=<encodeURIComponent(presignedS3Url)>
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'image/*,*/*',
      },
    });

    if (!response.ok) {
      return new NextResponse(null, { status: response.status });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const body = response.body;

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}

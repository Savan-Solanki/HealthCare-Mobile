const PRODUCTION_API_ORIGIN = 'http://13.205.6.9:5001';
const API_VERSION_PATH = '/api/v1';

export const getApiOrigin = (): string => {
  let configured = process.env.NEXT_PUBLIC_API_URL?.trim();

  // On production HTTPS web pages, direct browser calls to HTTP endpoints (e.g. http://13.205.6.9:5001)
  // are blocked or fail due to mixed content/upgrade-insecure-requests. Use relative path "" so API calls
  // route cleanly through Next.js server rewrites (/api/v1).
  if (typeof window !== 'undefined' && window.location?.protocol === 'https:') {
    if (!configured || configured.startsWith('/') || configured.startsWith('http://')) {
      return '';
    }
  }

  if (!configured || configured.startsWith('/')) {
    return PRODUCTION_API_ORIGIN;
  }

  // Only rewrite localhost/127.0.0.1 if accessing via a local network IP or .local domain
  if (typeof window !== 'undefined' && window.location) {
    const { hostname } = window.location;
    const isLocalNetworkHost = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.endsWith('.local');
    if (isLocalNetworkHost && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      configured = configured.replace('localhost', hostname).replace('127.0.0.1', hostname);
    }
  }

  return configured.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
};

export const getSocketOrigin = (): string => {
  let configured = process.env.NEXT_PUBLIC_API_URL?.trim();

  if (!configured || configured.startsWith('/')) {
    return PRODUCTION_API_ORIGIN;
  }

  return configured.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
};

export const getApiBaseUrl = (): string => `${getApiOrigin()}${API_VERSION_PATH}`;

export const API_ORIGIN = getApiOrigin();
export const API_BASE_URL = getApiBaseUrl();

const PRODUCTION_API_ORIGIN = 'http://13.201.29.22:5001';
const API_VERSION_PATH = '/api/v1';

const normalizeApiOrigin = (value?: string) => {
  let configured = value?.trim();

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

export const API_ORIGIN = normalizeApiOrigin(process.env.NEXT_PUBLIC_API_URL);
export const API_BASE_URL = `${API_ORIGIN}${API_VERSION_PATH}`;

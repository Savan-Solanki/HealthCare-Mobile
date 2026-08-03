const PRODUCTION_API_ORIGIN = 'https://api.medikwikhealthbuddy.in';
const API_VERSION_PATH = '/api/v1';

const normalizeApiOrigin = (value?: string) => {
  let configured = value?.trim();

  if (!configured || configured.startsWith('/')) {
    return PRODUCTION_API_ORIGIN;
  }

  // If running in browser and URL refers to localhost/127.0.0.1, but browser accesses via local IP,
  // dynamically replace localhost/127.0.0.1 with the page's current hostname so that the device
  // can connect to the dev server.
  if (typeof window !== 'undefined' && window.location) {
    const { hostname } = window.location;
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      configured = configured.replace('localhost', hostname).replace('127.0.0.1', hostname);
    }
  }

  return configured.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
};

export const API_ORIGIN = normalizeApiOrigin(process.env.NEXT_PUBLIC_API_URL);
export const API_BASE_URL = `${API_ORIGIN}${API_VERSION_PATH}`;

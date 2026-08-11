import axios, {
  AxiosError,
  AxiosHeaders,
  InternalAxiosRequestConfig,
} from 'axios';
import { API_BASE_URL, getApiBaseUrl } from '@/lib/api-url';

import { getDeviceDetails } from '@/lib/device';

const API_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS) || 10000;

export const clearPatientSession = () => {
  if (typeof window === 'undefined') return;

  localStorage.removeItem('patient_access_token');
  localStorage.removeItem('patient_user');
  localStorage.removeItem('patient_linked_accounts');
  localStorage.removeItem('patient_active_account_id');
  localStorage.removeItem('patient_session_start');
};

const persistPatientSession = (accessToken?: string, user?: unknown) => {
  if (typeof window === 'undefined') return;

  if (accessToken) {
    localStorage.setItem('patient_access_token', accessToken);
  }

  if (user) {
    localStorage.setItem('patient_user', JSON.stringify(user));
  }
};

const redirectToPatientLogin = () => {
  if (typeof window === 'undefined') return;
  if (window.location.pathname === '/login') return;
  
  const isDeliberate = sessionStorage.getItem('patient_deliberate_logout') === '1';
  if (isDeliberate) {
    sessionStorage.removeItem('patient_deliberate_logout');
    window.location.href = '/login';
  } else {
    window.location.href = '/login?expired=1';
  }
};

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

let refreshPromise: Promise<string | null> | null = null;

const setAuthorizationHeader = (
  config: InternalAxiosRequestConfig,
  token: string
) => {
  config.headers = AxiosHeaders.from(config.headers);
  config.headers.set('Authorization', `Bearer ${token}`);
};

const refreshPatientAccessToken = async (): Promise<string | null> => {
  if (typeof window === 'undefined') return null;

  try {
    const device = getDeviceDetails();
    const baseUrl = getApiBaseUrl();
    const response = await axios.post<{
      accessToken?: string;
      user?: unknown;
    }>(
      `${baseUrl}/patient/auth/refresh`,
      {},
      {
        withCredentials: true,
        timeout: API_TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': device.deviceId,
          'x-device-name': device.deviceName,
          'x-device-type': device.deviceType,
          'x-browser-version': device.browserVersion,
        },
      }
    );

    if (!response.data?.accessToken) {
      clearPatientSession();
      return null;
    }

    persistPatientSession(response.data.accessToken, response.data.user);
    return response.data.accessToken;
  } catch {
    clearPatientSession();
    return null;
  }
};

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    config.baseURL = getApiBaseUrl();
    const token = localStorage.getItem('patient_access_token');
    if (token) setAuthorizationHeader(config, token);

    const device = getDeviceDetails();
    config.headers = AxiosHeaders.from(config.headers);
    config.headers.set('x-device-id', device.deviceId);
    config.headers.set('x-device-name', device.deviceName);
    config.headers.set('x-device-type', device.deviceType);
    config.headers.set('x-browser-version', device.browserVersion);

  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (typeof window === 'undefined') {
      return Promise.reject(error);
    }

    const status = error.response?.status;
    const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const isRefreshRequest = typeof originalRequest?.url === 'string'
      && originalRequest.url.includes('/patient/auth/refresh');

    if (status === 401 && originalRequest && !originalRequest._retry && !isRefreshRequest) {
      originalRequest._retry = true;

      refreshPromise ??= refreshPatientAccessToken().finally(() => {
        refreshPromise = null;
      });

      const nextToken = await refreshPromise;
      if (nextToken) {
        setAuthorizationHeader(originalRequest, nextToken);
        return api(originalRequest);
      }

      clearPatientSession();
      redirectToPatientLogin();
    }

    return Promise.reject(error);
  }
);

export const logoutPatient = async () => {
  try {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('patient_deliberate_logout', '1');
    }
    const baseUrl = getApiBaseUrl();
    await axios.post(
      `${baseUrl}/patient/auth/logout`,
      {},
      {
        withCredentials: true,
        timeout: API_TIMEOUT_MS,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } finally {
    clearPatientSession();
  }
};

export default api;

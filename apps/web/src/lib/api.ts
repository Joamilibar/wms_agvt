import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export const TOKEN_KEY = 'wms_token';
export const REFRESH_KEY = 'wms_refresh';
export const USER_KEY = 'wms_user';

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

function toLogin() {
  clearSession();
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

/**
 * M-08: the access token is short-lived now, so a 401 is the expected way a
 * session continues, not the end of it. Refresh once, replay the request, and
 * only bounce to /login if the refresh itself is rejected.
 *
 * The in-flight promise is shared so a burst of parallel 401s produces a single
 * refresh: the server rotates the token away on use, and two concurrent
 * refreshes would look like a replay and revoke the whole family.
 */
let refreshing: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) throw new Error('no refresh token');

  // A bare client: the interceptors above would recurse.
  const { data } = await axios.post(`${API_URL}/auth/refresh`, { refresh_token: refreshToken });

  localStorage.setItem(TOKEN_KEY, data.access_token);
  localStorage.setItem(REFRESH_KEY, data.refresh_token);
  if (data.user) localStorage.setItem(USER_KEY, JSON.stringify(data.user));

  return data.access_token as string;
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean };
    const isAuthCall = original?.url?.includes('/auth/refresh') || original?.url?.includes('/auth/login');

    if (error.response?.status !== 401 || !original || original._retried || isAuthCall) {
      if (error.response?.status === 401 && isAuthCall && original?.url?.includes('/auth/refresh')) {
        toLogin();
      }
      return Promise.reject(error);
    }

    original._retried = true;

    try {
      refreshing = refreshing ?? refreshAccessToken().finally(() => { refreshing = null; });
      const token = await refreshing;
      original.headers.Authorization = `Bearer ${token}`;
      return api(original);
    } catch {
      toLogin();
      return Promise.reject(error);
    }
  },
);

export { clearSession };
export default api;

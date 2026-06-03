import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  withCredentials: true,
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  },
});

export async function fetchCsrfCookie(): Promise<void> {
  await api.get('/sanctum/csrf-cookie');
}

api.interceptors.request.use((config) => {
  const xsrfToken = document.cookie
    .split('; ')
    .find((row) => row.startsWith('XSRF-TOKEN='))
    ?.split('=')[1];

  if (xsrfToken) {
    config.headers['X-XSRF-TOKEN'] = decodeURIComponent(xsrfToken);
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // DEBUG: log every failed request
    console.error('[API ERROR]', error.response?.status, error.config?.method?.toUpperCase(), error.config?.url, error.response?.data);

    if (error.response?.status === 401) {
      const currentPath = window.location.pathname;
      if (currentPath !== '/login' && currentPath !== '/2fa') {
        window.location.href = '/login';
      }
    }

    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'];
      const seconds = retryAfter ? parseInt(retryAfter, 10) : 60;
      const event = new CustomEvent('api:rate-limited', { detail: { seconds } });
      window.dispatchEvent(event);
    }

    return Promise.reject(error);
  },
);

export default api;

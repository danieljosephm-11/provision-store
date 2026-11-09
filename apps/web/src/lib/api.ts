const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api/v1';
const API_ORIGIN = BASE.startsWith('http') ? new URL(BASE).origin : '';

let accessToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;
let refreshing: Promise<boolean> | null = null;

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  requestId?: string;

  constructor(message: string, status: number, code = 'ERROR', details?: unknown, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function onUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

export async function refreshAccessToken(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { accessToken?: string };
      if (!data.accessToken) return false;
      accessToken = data.accessToken;
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function parseBody(res: Response): Promise<unknown> {
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('application/json')) return res.json();
  return res.text();
}

async function rawRequest(path: string, options: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  return fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body,
    credentials: 'include',
    signal: options.signal,
  });
}

async function throwApiError(res: Response): Promise<never> {
  let payload: any = null;
  try {
    payload = await parseBody(res);
  } catch {
    payload = null;
  }
  const err = payload?.error;
  throw new ApiError(
    err?.message ?? `Request failed with status ${res.status}`,
    res.status,
    err?.code ?? 'ERROR',
    err?.details,
    err?.requestId,
  );
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let res = await rawRequest(path, options);

  if (res.status === 401 && !path.startsWith('/auth/refresh')) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await rawRequest(path, options);
    } else {
      accessToken = null;
      unauthorizedHandler?.();
    }
  }

  if (!res.ok) return throwApiError(res);
  if (res.status === 204) return undefined as T;
  return (await parseBody(res)) as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
};

export async function fetchBlob(path: string): Promise<Blob> {
  let res = await rawRequest(path);
  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) res = await rawRequest(path);
  }
  if (!res.ok) await throwApiError(res);
  return res.blob();
}

/** Fetch a protected document and show it in a new tab (browser's PDF viewer / download). */
export async function openDocument(path: string, mode: 'open' | 'download' = 'open', filename?: string) {
  const blob = await fetchBlob(path);
  const url = URL.createObjectURL(blob);
  if (mode === 'open') {
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } else {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename ?? 'document';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

export function buildQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Uploaded files are stored as root-relative `/uploads/...` paths. When the API
 * lives on a different origin (e.g. Vercel web + Render API) those paths must be
 * resolved against the API origin or the browser requests them from the web host.
 */
export function assetUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (API_ORIGIN && url.startsWith('/uploads/')) return `${API_ORIGIN}${url}`;
  return url;
}

export { BASE as API_BASE };

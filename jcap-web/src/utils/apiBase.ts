/**
 * Centralized API & Media URL resolution helpers for same-origin (Vite proxy / Nginx)
 * and split-origin self-hosting deployments (via VITE_API_BASE_URL).
 */

export function getApiBaseUrl(overrideBaseUrl?: string): string {
  const raw =
    overrideBaseUrl !== undefined
      ? overrideBaseUrl
      : typeof import.meta !== 'undefined'
        ? import.meta.env?.VITE_API_BASE_URL
        : undefined;

  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/\/+$/, '');
}

export function resolveApiUrl(path: string, overrideBaseUrl?: string): string {
  const trimmed = path.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const base = getApiBaseUrl(overrideBaseUrl);
  const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${base}${normalizedPath}`;
}

export function resolveMediaUrl(
  url?: string | null,
  overrideBaseUrl?: string
): string | undefined {
  if (!url || typeof url !== 'string') return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;

  if (/^(https?:|blob:|data:)/i.test(trimmed)) {
    return trimmed;
  }

  const base = getApiBaseUrl(overrideBaseUrl);
  const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${base}${normalizedPath}`;
}

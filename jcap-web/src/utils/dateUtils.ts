/**
 * Utility functions for handling date and time parsing/formatting across the app.
 * Ensures UTC ISO strings without 'Z' suffix (e.g., from ASP.NET Core EF Core)
 * are properly parsed as UTC so local browser time (e.g. UTC+7 Vietnam) is displayed accurately.
 */

export function parseDateTime(dateInput: string | Date | null | undefined): Date | null {
  if (!dateInput) return null;
  if (dateInput instanceof Date) return dateInput;

  let str = dateInput.trim();
  if (!str) return null;

  // If ISO string like "2026-09-27T16:42:47" missing 'Z' or offset (+07:00 / -05:00)
  if (str.includes('T') && !str.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(str)) {
    str += 'Z';
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDateTime(
  dateInput: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = parseDateTime(dateInput);
  if (!d) return typeof dateInput === 'string' ? dateInput : '—';

  const defaultOptions: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  };

  try {
    return d.toLocaleString('vi-VN', defaultOptions);
  } catch {
    return typeof dateInput === 'string' ? dateInput : '—';
  }
}

export function formatDateMedium(dateInput: string | Date | null | undefined): string {
  const d = parseDateTime(dateInput);
  if (!d) return typeof dateInput === 'string' ? dateInput : '—';

  try {
    return new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return typeof dateInput === 'string' ? dateInput : '—';
  }
}

export function formatDateFull(dateInput: string | Date | null | undefined): string {
  const d = parseDateTime(dateInput);
  if (!d) return typeof dateInput === 'string' ? dateInput : '—';

  try {
    return new Intl.DateTimeFormat('vi-VN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(d);
  } catch {
    return typeof dateInput === 'string' ? dateInput : '—';
  }
}

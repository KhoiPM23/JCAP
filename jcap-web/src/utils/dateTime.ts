const HAS_TIME_ZONE_SUFFIX = /(?:Z|[+-]\d{2}:\d{2})$/i;

export const parseUtcDateTime = (value: string): Date => {
  const normalizedValue = HAS_TIME_ZONE_SUFFIX.test(value) ? value : `${value}Z`;
  return new Date(normalizedValue);
};

export const formatVietnamDateTime = (
  value: string,
  options: Intl.DateTimeFormatOptions,
): string =>
  new Intl.DateTimeFormat('vi-VN', {
    ...options,
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(parseUtcDateTime(value));

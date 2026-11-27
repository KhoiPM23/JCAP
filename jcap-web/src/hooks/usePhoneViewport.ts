import { useSyncExternalStore } from 'react';

const query = '(max-width: 767px), (max-width: 1023px) and (max-height: 500px) and (pointer: coarse)';

function subscribe(onChange: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

export function usePhoneViewport() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

function getSnapshot() {
  return window.matchMedia(query).matches;
}

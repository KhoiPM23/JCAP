import { useCallback } from 'react';
import { usePhoneViewport } from './usePhoneViewport';

// On phones the keyboard can shrink the visible area without resizing the page.
export function usePracticeViewport() {
  const mobile = usePhoneViewport();
  const room = useCallback((element: HTMLDivElement | null) => {
    const viewport = window.visualViewport;
    if (!mobile || !viewport || !element) return;
    const updateHeight = () => element.style.setProperty('--jx-practice-height', `${viewport.height}px`);
    updateHeight();
    viewport.addEventListener('resize', updateHeight);
    return () => {
      viewport.removeEventListener('resize', updateHeight);
      element.style.removeProperty('--jx-practice-height');
    };
  }, [mobile]);

  return { mobile, room };
}

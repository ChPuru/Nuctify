import { useEffect, useState } from 'react';

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function useMediaQuery(query: string): boolean {
  const get = () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches;
  const [match, setMatch] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [query]);
  return match;
}

export const useIsMobile = () => useMediaQuery('(max-width: 1023px)');
export const useIsTouch = () => useMediaQuery('(hover: none), (pointer: coarse)');

export const isTypingTarget = (el: Element | null) => {
  const h = el as HTMLElement | null;
  if (!h) return false;
  const tag = h.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || h.isContentEditable || h.getAttribute('role') === 'slider';
};

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
export const focusables = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((e) => e.offsetParent !== null || e === document.activeElement);

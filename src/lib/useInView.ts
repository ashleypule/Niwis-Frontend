import { useEffect, useState, type RefObject } from 'react';

/**
 * Resolves once per page, 1.2 s after the window `load` event and then at an idle moment. In this single-page app
 * `load` fires before React has rendered the page, so the delay is what lets the first content paint before heavy work
 * (a map high on the page) starts.
 */
let settled: Promise<void> | undefined;
function pageSettled(): Promise<void> {
  settled ??= new Promise<void>((resolve) => {
    const idle = () =>
      'requestIdleCallback' in window
        ? window.requestIdleCallback(() => resolve(), { timeout: 1000 })
        : setTimeout(resolve, 200);
    const later = () => setTimeout(idle, 1200);
    if (document.readyState === 'complete') later();
    else window.addEventListener('load', later, { once: true });
  });
  return settled;
}

/**
 * True once the element has come within `margin` of the viewport, and true from then on (heavy libraries such as
 * ECharts and Leaflet load on first view and stay). With `afterLoad`, it also waits until the page has loaded and the
 * browser is idle, so heavy work near the top of a page (a map: Leaflet plus a 240 KB boundary file) does not compete
 * with the first paint. Without IntersectionObserver (old browsers, some test environments) it is true at once.
 */
export function useInView(ref: RefObject<Element>, margin = '300px', opts: { afterLoad?: boolean } = {}): boolean {
  const { afterLoad = false } = opts;
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (seen || !el) return;
    let io: IntersectionObserver | undefined;
    let live = true;
    const observe = () => {
      if (!live) return;
      io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            setSeen(true);
            io?.disconnect();
          }
        },
        { rootMargin: margin },
      );
      io.observe(el);
    };
    if (afterLoad) void pageSettled().then(observe);
    else observe();
    return () => {
      live = false;
      io?.disconnect();
    };
  }, [ref, margin, seen, afterLoad]);
  return seen;
}
